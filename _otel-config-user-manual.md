# OTEL Collector Configuration User Manual

이 문서는 `data/otel-collector/otel-collector-config.yaml` 설정 파일에 대한 상세 설명서입니다.

## 목차

1. [구성 개요](#구성-개요)
2. [Receivers (수신기)](#receivers-수신기)
3. [Processors (처리기)](#processors-처리기)
4. [Connectors (연결기)](#connectors-연결기)
5. [Exporters (내보내기)](#exporters-내보내기)
6. [Extensions (확장)](#extensions-확장)
7. [Service (서비스)](#service-서비스)
8. [설정 변경 가이드](#설정-변경-가이드)
9. [문제 해결](#문제-해결)

---

## 구성 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OTEL Collector Pipeline                           │
│                                                                      │
│   Receivers        Processors              Exporters                 │
│   (데이터 수신)     (데이터 처리)            (데이터 전송)             │
│                                                                      │
│   ┌────────┐      ┌──────────────┐        ┌──────────────────┐      │
│   │  OTLP  │ ──►  │memory_limiter│ ──►    │ otlphttp/        │      │
│   │ (gRPC) │      └──────────────┘        │ clickstack       │      │
│   │ (HTTP) │             │                └──────────────────┘      │
│   └────────┘      ┌──────────────┐                                  │
│                   │tail_sampling │  (traces only)                   │
│                   └──────────────┘                                  │
│                          │                                          │
│                   ┌──────────────┐                                  │
│                   │routing/logs  │  (logs - severity routing)       │
│                   └──────────────┘                                  │
│                          │                                          │
│                   ┌──────────────┐                                  │
│                   │    batch     │                                  │
│                   └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 파이프라인별 처리 흐름

| Pipeline | Receivers | Processors | Exporters |
|----------|-----------|------------|-----------|
| **traces** | otlp | memory_limiter → tail_sampling → batch | otlphttp/clickstack |
| **metrics** | otlp | memory_limiter → batch | otlphttp/clickstack |
| **logs** (entry) | otlp | memory_limiter | routing/logs |
| **logs/errors** | routing/logs | batch | otlphttp/clickstack |
| **logs/normal** | routing/logs | probabilistic_sampler/logs → batch | otlphttp/clickstack |

---

## Receivers (수신기)

데이터를 수신하는 엔드포인트를 정의합니다.

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
```

### 설정 설명

| 프로토콜 | 포트 | 용도 | 클라이언트 |
|----------|------|------|-----------|
| **gRPC** | 4317 | 고성능 바이너리 전송 | Backend (NestJS) |
| **HTTP** | 4318 | 브라우저 호환 | Frontend (React) |

### 주요 옵션

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        max_recv_msg_size_mib: 4        # 최대 메시지 크기 (기본: 4MB)
        max_concurrent_streams: 100      # 동시 스트림 수
        read_buffer_size: 512KB          # 읽기 버퍼
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins: ["*"]         # CORS 허용 (프론트엔드용)
          allowed_headers: ["*"]
```

---

## Processors (처리기)

데이터를 변환, 필터링, 샘플링하는 컴포넌트입니다.

### 1. Memory Limiter (메모리 제한)

OOM(Out of Memory)을 방지하기 위한 메모리 제한 설정입니다.

```yaml
processors:
  memory_limiter:
    check_interval: 1s       # 메모리 체크 주기
    limit_mib: 512           # 최대 메모리 사용량 (MB)
    spike_limit_mib: 128     # 스파이크 허용량 (MB)
```

| 설정 | 값 | 설명 |
|------|-----|------|
| `check_interval` | 1s | 메모리 사용량 체크 간격 |
| `limit_mib` | 512 | 이 값을 초과하면 데이터 거부 시작 |
| `spike_limit_mib` | 128 | 순간적인 스파이크 허용량 |

**동작 방식:**
```
메모리 사용량 < (limit_mib - spike_limit_mib) = 384MB  →  정상 처리
메모리 사용량 > 384MB  →  소프트 제한 (새 데이터 거부 시작)
메모리 사용량 > 512MB  →  하드 제한 (강제 데이터 거부)
```

### 2. Batch (배치 처리)

네트워크 효율성을 위해 데이터를 배치로 모아서 전송합니다.

```yaml
processors:
  batch:
    timeout: 5s              # 최대 대기 시간
    send_batch_size: 512     # 배치당 항목 수
    send_batch_max_size: 1024  # 최대 배치 크기
```

| 설정 | 값 | 설명 |
|------|-----|------|
| `timeout` | 5s | 이 시간이 지나면 배치가 덜 차도 전송 |
| `send_batch_size` | 512 | 이 수만큼 모이면 즉시 전송 |
| `send_batch_max_size` | 1024 | 배치 최대 크기 (초과 시 분할) |

### 3. Tail Sampling (테일 기반 샘플링) - Traces용

**이 프로젝트의 핵심 설정입니다.** 트레이스가 완료된 후 샘플링 여부를 결정합니다.

```yaml
processors:
  tail_sampling:
    decision_wait: 10s                  # 트레이스 완료 대기 시간
    num_traces: 50000                   # 메모리에 보관할 최대 트레이스 수
    expected_new_traces_per_sec: 100    # 예상 초당 트레이스 수
    policies:
      # ... 정책들
```

#### 기본 설정

| 설정 | 값 | 설명 |
|------|-----|------|
| `decision_wait` | 10s | 트레이스의 모든 스팬이 도착할 때까지 대기 |
| `num_traces` | 50000 | 메모리에 보관할 트레이스 수 (초과 시 가장 오래된 것 삭제) |
| `expected_new_traces_per_sec` | 100 | 메모리 할당 최적화를 위한 힌트 |

#### 샘플링 정책

정책은 **순서대로 평가**되며, **첫 번째 매칭 정책에서 결정**됩니다.

```yaml
policies:
  # Policy 1: 에러가 있는 트레이스는 항상 보존 (100%)
  - name: errors-policy
    type: status_code
    status_code:
      status_codes:
        - ERROR

  # Policy 2: 지연 시간이 긴 트레이스 보존 (latency > 2s)
  - name: latency-policy
    type: latency
    latency:
      threshold_ms: 2000

  # Policy 3: 특정 HTTP 상태 코드 보존 (4xx, 5xx)
  - name: http-error-policy
    type: string_attribute
    string_attribute:
      key: http.response.status_code
      values:
        - "400"
        - "500"
        - "502"
        - "503"
        - "504"

  # Policy 4: 정상 트레이스는 10% 샘플링
  - name: probabilistic-policy
    type: probabilistic
    probabilistic:
      sampling_percentage: 10
```

#### 정책 상세 설명

| 정책 | 타입 | 조건 | 결과 |
|------|------|------|------|
| **errors-policy** | `status_code` | 스팬 상태가 ERROR | 100% 보존 |
| **latency-policy** | `latency` | 트레이스 총 시간 > 2000ms | 100% 보존 |
| **http-error-policy** | `string_attribute` | HTTP 상태 코드가 4xx/5xx | 100% 보존 |
| **probabilistic-policy** | `probabilistic` | 위 조건에 해당하지 않음 | 10% 샘플링 |

#### 정책 평가 흐름

```
트레이스 도착
     │
     ▼
┌─────────────────────────────────┐
│ errors-policy: ERROR 상태인가?  │
└─────────────────────────────────┘
     │ Yes → 100% 보존
     │ No
     ▼
┌─────────────────────────────────┐
│ latency-policy: > 2000ms인가?   │
└─────────────────────────────────┘
     │ Yes → 100% 보존
     │ No
     ▼
┌─────────────────────────────────┐
│ http-error-policy: 4xx/5xx인가? │
└─────────────────────────────────┘
     │ Yes → 100% 보존
     │ No
     ▼
┌─────────────────────────────────┐
│ probabilistic-policy: 10% 확률  │
└─────────────────────────────────┘
     │ 10% → 보존
     │ 90% → 드롭
```

### 4. Probabilistic Sampler (확률적 샘플링) - Logs용

정상 로그(ERROR 미만)에 대해 10% 샘플링을 적용합니다.

```yaml
processors:
  probabilistic_sampler/logs:
    sampling_percentage: 10    # 10% 샘플링
    hash_seed: 42              # 일관된 샘플링을 위한 시드
```

| 설정 | 값 | 설명 |
|------|-----|------|
| `sampling_percentage` | 10 | 통과시킬 로그 비율 (%) |
| `hash_seed` | 42 | 동일 로그가 항상 같은 결과를 얻도록 |

> **Note**: `tail_sampling`과 달리 `probabilistic_sampler`는 즉시 결정을 내립니다. 로그는 트레이스와 달리 부모-자식 관계가 없기 때문입니다.

---

## Connectors (연결기)

파이프라인 간 데이터를 라우팅하는 컴포넌트입니다.

### Routing Connector (로그 라우팅)

로그를 severity에 따라 다른 파이프라인으로 분기합니다.

```yaml
connectors:
  routing/logs:
    default_pipelines: [logs/normal]    # 기본: 정상 로그 파이프라인
    error_mode: ignore                   # 에러 무시
    table:
      # ERROR 이상 (severity_number >= 17) → 에러 파이프라인
      - context: log
        condition: severity_number >= SEVERITY_NUMBER_ERROR
        pipelines: [logs/errors]
```

#### 설정 설명

| 설정 | 값 | 설명 |
|------|-----|------|
| `default_pipelines` | `[logs/normal]` | 조건에 매칭되지 않으면 여기로 |
| `context` | `log` | 로그 컨텍스트에서 필드 접근 |
| `condition` | OTTL 표현식 | 라우팅 조건 |
| `SEVERITY_NUMBER_ERROR` | 17 | OpenTelemetry ERROR 레벨 |

#### Severity Number 참조

| 레벨 | 숫자 범위 | 라우팅 결과 |
|------|----------|------------|
| TRACE | 1-4 | logs/normal (10% 샘플링) |
| DEBUG | 5-8 | logs/normal (10% 샘플링) |
| INFO | 9-12 | logs/normal (10% 샘플링) |
| WARN | 13-16 | logs/normal (10% 샘플링) |
| ERROR | 17-20 | logs/errors (100% 보존) |
| FATAL | 21-24 | logs/errors (100% 보존) |

#### 로그 샘플링 플로우

```
OTLP Logs 수신
       │
       ▼
┌──────────────────┐
│  routing/logs    │
│  (severity 분기)  │
└────────┬─────────┘
         │
   ┌─────┴─────┐
   │           │
   ▼           ▼
ERROR+      INFO/DEBUG/WARN
   │           │
   │    ┌──────────────────┐
   │    │probabilistic     │
   │    │_sampler/logs     │
   │    │  (10% 샘플링)     │
   │    └────────┬─────────┘
   │             │
   ▼             ▼
100% 보존     10% 보존
   │             │
   └──────┬──────┘
          ▼
   otlphttp/clickstack
```

---

## Exporters (내보내기)

처리된 데이터를 외부 시스템으로 전송합니다.

```yaml
exporters:
  otlphttp/clickstack:
    endpoint: http://clickstack:4318
    headers:
      authorization: "2ce0b5fc-7ce2-4c48-82a9-6487c6a17a8e"
```

| 설정 | 값 | 설명 |
|------|-----|------|
| `endpoint` | `http://clickstack:4318` | ClickStack의 OTLP HTTP 엔드포인트 |
| `headers.authorization` | API 키 | HyperDX 인증 토큰 |

> **Note**: ClickStack(HyperDX)는 OTLP 프로토콜을 사용하므로 `otlphttp` exporter를 사용합니다.

### 디버그 Exporter (선택사항)

문제 해결 시 활성화하면 콘솔에 데이터를 출력합니다:

```yaml
exporters:
  debug:
    verbosity: detailed    # basic, normal, detailed
```

---

## Extensions (확장)

Collector의 부가 기능을 제공합니다.

```yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133

  pprof:
    endpoint: 0.0.0.0:1777

  zpages:
    endpoint: 0.0.0.0:55679
```

| Extension | 포트 | 용도 | 확인 방법 |
|-----------|------|------|----------|
| **health_check** | 13133 | 헬스 체크 | `curl http://localhost:13133/` |
| **pprof** | 1777 | Go 프로파일링 | `go tool pprof http://localhost:1777/debug/pprof/profile` |
| **zpages** | 55679 | 디버그 UI | 브라우저에서 `http://localhost:55679/debug/tracez` |

### zPages 디버그 페이지

| 페이지 | URL | 용도 |
|--------|-----|------|
| TraceZ | `/debug/tracez` | 최근 트레이스 샘플 확인 |
| PipelineZ | `/debug/pipelinez` | 파이프라인 상태 확인 |
| ExtensionZ | `/debug/extensionz` | 확장 상태 확인 |

---

## Service (서비스)

파이프라인과 텔레메트리를 정의합니다.

### 파이프라인 정의

```yaml
service:
  extensions: [health_check, pprof, zpages]

  pipelines:
    # Traces: tail-based sampling 적용
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlphttp/clickstack]

    # Metrics: 샘플링 없이 모두 전달
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/clickstack]

    # Logs (Entry): routing connector로 분기
    logs:
      receivers: [otlp]
      processors: [memory_limiter]
      exporters: [routing/logs]

    # Error Logs: 100% 보존
    logs/errors:
      receivers: [routing/logs]
      processors: [batch]
      exporters: [otlphttp/clickstack]

    # Normal Logs: 10% 샘플링
    logs/normal:
      receivers: [routing/logs]
      processors: [probabilistic_sampler/logs, batch]
      exporters: [otlphttp/clickstack]
```

**샘플링 요약:**
- **Traces**: tail_sampling으로 에러 100%, 정상 10%
- **Metrics**: 샘플링 없이 100% 전달
- **Logs**: routing connector로 ERROR+ 100%, 나머지 10%

### Collector 자체 텔레메트리

```yaml
service:
  telemetry:
    logs:
      level: info                    # Collector 로그 레벨
    metrics:
      level: detailed                # 메트릭 상세도
      readers:
        - pull:
            exporter:
              prometheus:
                host: "0.0.0.0"
                port: 8888           # Collector 메트릭 엔드포인트
```

| 설정 | 값 | 설명 |
|------|-----|------|
| `logs.level` | info | Collector 자체 로그 레벨 (debug, info, warn, error) |
| `metrics.level` | detailed | 메트릭 상세도 (none, basic, normal, detailed) |
| `prometheus.port` | 8888 | Collector 메트릭 스크래핑 포트 |

**참고:** `prometheus`는 Collector 자체 메트릭을 Prometheus 포맷으로 노출하는 것이며, 앱 데이터와는 무관합니다.

```bash
# Collector 자체 메트릭 확인
curl http://localhost:8888/metrics | grep otelcol
```

---

## 설정 변경 가이드

### 트레이스 샘플링 비율 변경

```yaml
# 10% → 20%로 변경
- name: probabilistic-policy
  type: probabilistic
  probabilistic:
    sampling_percentage: 20   # 변경
```

### 로그 샘플링 비율 변경

```yaml
# 10% → 30%로 변경
probabilistic_sampler/logs:
  sampling_percentage: 30     # 변경
  hash_seed: 42
```

### 지연 임계값 변경

```yaml
# 2초 → 1초로 변경
- name: latency-policy
  type: latency
  latency:
    threshold_ms: 1000        # 변경
```

### HTTP 에러 코드 추가

```yaml
- name: http-error-policy
  type: string_attribute
  string_attribute:
    key: http.response.status_code
    values:
      - "400"
      - "401"    # 추가
      - "403"    # 추가
      - "500"
      - "502"
      - "503"
      - "504"
```

### 새 정책 추가 (예: 특정 서비스 100% 보존)

```yaml
policies:
  # 기존 정책들...

  # 새 정책: payment 서비스는 100% 보존
  - name: payment-service-policy
    type: string_attribute
    string_attribute:
      key: service.name
      values:
        - "payment-service"
```

### 설정 적용

```bash
# Collector 재시작
docker compose -f docker-compose.db.yml restart otel-collector

# 설정 검증
docker logs clickstack-otel-otel-collector-1 2>&1 | head -20
```

---

## 문제 해결

### 1. Collector가 시작되지 않음

```bash
# 로그 확인
docker logs clickstack-otel-otel-collector-1 2>&1 | head -30
```

**일반적인 에러:**

| 에러 | 원인 | 해결 |
|------|------|------|
| `cannot unmarshal the configuration` | YAML 문법 오류 | YAML 유효성 검사 |
| `invalid keys` | 잘못된 설정 키 | 공식 문서 참조 |
| `address already in use` | 포트 충돌 | 포트 변경 또는 기존 프로세스 종료 |

### 2. 트레이스가 수신되지 않음

```bash
# 수신 확인
curl -s http://localhost:8888/metrics | grep "receiver_accepted"

# 예상 출력:
# otelcol_receiver_accepted_spans{...} > 0
```

### 3. 샘플링이 작동하지 않음

```bash
# 트레이스 샘플링 통계 확인
curl -s http://localhost:8888/metrics | grep "tail_sampling"

# 로그 샘플링 통계 확인
curl -s http://localhost:8888/metrics | grep "probabilistic_sampler"

# 확인할 메트릭:
# - policy_execution_count_total: 정책 실행 횟수
# - count_traces_sampled_total: 샘플링된 트레이스 수
# - processor_incoming_items_total: 들어온 항목 수
# - processor_outgoing_items_total: 나간 항목 수
```

### 4. 메모리 사용량 확인

```bash
# 현재 메모리 상태
curl -s http://localhost:8888/metrics | grep "memory"
```

---

## 전체 설정 파일 요약

```
┌─────────────────────────────────────────────────────────────────────┐
│  otel-collector-config.yaml                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  receivers:                                                          │
│    └── otlp (gRPC:4317, HTTP:4318)                                  │
│                                                                      │
│  processors:                                                         │
│    ├── memory_limiter (512MB 제한)                                  │
│    ├── tail_sampling (에러 100%, 정상 10%) - traces                 │
│    ├── probabilistic_sampler/logs (10%) - logs                      │
│    └── batch (5초/512개 단위)                                       │
│                                                                      │
│  connectors:                                                         │
│    └── routing/logs (severity 기반 분기)                            │
│                                                                      │
│  exporters:                                                          │
│    └── otlphttp/clickstack (http://clickstack:4318)                 │
│                                                                      │
│  extensions:                                                         │
│    ├── health_check (:13133)                                        │
│    ├── pprof (:1777)                                                │
│    └── zpages (:55679)                                              │
│                                                                      │
│  service:                                                            │
│    ├── pipelines:                                                    │
│    │   ├── traces     → [memory_limiter, tail_sampling, batch]      │
│    │   ├── metrics    → [memory_limiter, batch]                     │
│    │   ├── logs       → [memory_limiter] → routing/logs             │
│    │   ├── logs/errors→ [batch]                      (100% 보존)    │
│    │   └── logs/normal→ [probabilistic_sampler, batch] (10% 샘플)   │
│    └── telemetry:                                                    │
│        └── metrics → prometheus (:8888)                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 참고 자료

- [OpenTelemetry Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
- [Tail Sampling Processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)
- [Probabilistic Sampler Processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/probabilisticsamplerprocessor)
- [Routing Connector](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/connector/routingconnector)
- [Memory Limiter Processor](https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/memorylimiterprocessor)
- [Batch Processor](https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/batchprocessor)
