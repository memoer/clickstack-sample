# How to Check Tail-Based Sampling in OTEL Collector

이 문서는 OpenTelemetry Collector의 Tail-Based Sampling이 올바르게 작동하는지 확인하는 단계별 가이드입니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [Step 1: Collector 상태 확인](#step-1-collector-상태-확인)
3. [Step 2: 시작 로그 확인](#step-2-시작-로그-확인)
4. [Step 3: 샘플링 정책 확인](#step-3-샘플링-정책-확인)
5. [Step 4: 테스트 트래픽 생성](#step-4-테스트-트래픽-생성)
6. [Step 5: 샘플링 결과 확인](#step-5-샘플링-결과-확인)
7. [Step 6: HyperDX UI에서 확인](#step-6-hyperdx-ui에서-확인)
8. [문제 해결](#문제-해결)
9. [주요 메트릭 참조](#주요-메트릭-참조)

---

## 사전 요구사항

```bash
# 모든 서비스가 실행 중인지 확인
docker compose -f docker-compose.db.yml ps

# 필요한 서비스:
# - otel-collector (MUST be running)
# - clickstack (healthy)
# - backend (connected to otel-collector)
```

**필요한 포트:**
| 포트 | 용도 |
|------|------|
| 4317 | OTLP gRPC (Backend → Collector) |
| 4318 | OTLP HTTP (Frontend → Collector) |
| 8888 | Collector 메트릭 |
| 13133 | Health check |
| 55679 | zPages (디버깅 UI) |

---

## Step 1: Collector 상태 확인

### 1.1 Health Check

```bash
curl http://localhost:13133/
```

**정상 응답:**
```json
{
  "status": "Server available",
  "upSince": "2026-01-13T08:22:22.354340095Z",
  "uptime": "17.805064049s"
}
```

### 1.2 컨테이너 상태 확인

```bash
docker ps --filter "name=otel-collector" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**정상 출력:**
```
NAMES                              STATUS          PORTS
clickstack-otel-otel-collector-1   Up X minutes    0.0.0.0:4317-4318->4317-4318/tcp, ...
```

> ⚠️ `Exited` 상태라면 [문제 해결](#문제-해결) 섹션을 참조하세요.

---

## Step 2: 시작 로그 확인

```bash
docker logs clickstack-otel-otel-collector-1 2>&1 | grep -E "Starting|ready|error" | head -20
```

**확인해야 할 로그:**

```
✅ Starting GRPC server ... endpoint: [::]:4317
✅ Starting HTTP server ... endpoint: [::]:4318
✅ Health Check state change ... status: ready
✅ Everything is ready. Begin running and processing data.
```

**에러가 있다면:**
```
❌ Error: failed to get config: cannot unmarshal the configuration
❌ decoding failed due to the following error(s)
```

→ 설정 파일 문법 오류입니다. [문제 해결](#문제-해결) 참조.

---

## Step 3: 샘플링 정책 확인

### 3.1 정책 로드 확인

```bash
curl -s http://localhost:8888/metrics | grep "policy_execution_count" | grep -v "^#"
```

**정상 출력 (정책 이름이 표시됨):**
```
otelcol_processor_tail_sampling_sampling_policy_execution_count_total{...policy="errors-policy"} 0
otelcol_processor_tail_sampling_sampling_policy_execution_count_total{...policy="http-error-policy"} 0
otelcol_processor_tail_sampling_sampling_policy_execution_count_total{...policy="latency-policy"} 0
otelcol_processor_tail_sampling_sampling_policy_execution_count_total{...policy="probabilistic-policy"} 0
```

이 메트릭이 보이면 4개의 정책이 올바르게 로드된 것입니다:
- `errors-policy`: 에러 트레이스 100% 보존
- `latency-policy`: 고지연(>2s) 트레이스 보존
- `http-error-policy`: HTTP 4xx/5xx 보존
- `probabilistic-policy`: 나머지 10% 샘플링

### 3.2 설정 파일 확인

```bash
cat data/otel-collector/otel-collector-config.yaml | grep -A 30 "tail_sampling:"
```

---

## Step 4: 테스트 트래픽 생성

### 4.1 Backend가 Collector에 연결되었는지 확인

```bash
docker logs clickstack-otel-backend-1 2>&1 | grep "OTLP Target"
```

**정상 출력:**
```
OTLP Target: http://otel-collector:4317
```

> ⚠️ 만약 Backend가 Collector 시작 전에 실행되었다면 재시작이 필요합니다:
> ```bash
> docker compose -f docker-compose.yml restart backend
> ```

### 4.2 정상 요청 생성 (10% 샘플링 대상)

```bash
# 20개의 정상 요청 생성
for i in {1..20}; do
  curl -s http://localhost:3000/api/tasks/mongo > /dev/null &
done
wait
echo "Generated 20 normal requests"
```

### 4.3 에러 요청 생성 (100% 보존 대상)

```bash
# 존재하지 않는 리소스 요청 (404 에러)
for i in {1..5}; do
  curl -s http://localhost:3000/api/tasks/mongo/nonexistent-id > /dev/null &
done
wait
echo "Generated 5 error requests"
```

### 4.4 샘플링 결정 대기

```bash
# decision_wait (10초) + 버퍼 대기
echo "Waiting 12 seconds for sampling decisions..."
sleep 12
```

> 💡 `decision_wait: 10s` 설정으로 인해 Collector는 트레이스가 완료될 때까지 10초를 기다린 후 샘플링 결정을 내립니다.

---

## Step 5: 샘플링 결과 확인

### 5.1 전체 샘플링 통계

```bash
curl -s http://localhost:8888/metrics | grep "global_count_traces_sampled" | grep -v "^#"
```

**예시 출력:**
```
otelcol_processor_tail_sampling_global_count_traces_sampled_total{decision="sampled",...} 5
otelcol_processor_tail_sampling_global_count_traces_sampled_total{decision="not_sampled",...} 15
```

**해석:**
- `decision="sampled"`: ClickStack으로 전달된 트레이스 수
- `decision="not_sampled"`: 드롭된 트레이스 수
- 비율: 5/(5+15) = 25% (에러 요청 + 정상 요청의 10%)

### 5.2 정책별 상세 통계

```bash
curl -s http://localhost:8888/metrics | grep "count_traces_sampled_total" | grep -v "^#" | grep -v "global"
```

**예시 출력:**
```
# errors-policy: 에러 없음 → 모두 not_sampled로 다음 정책으로 넘어감
...policy="errors-policy",sampled="false"} 20

# http-error-policy: HTTP 에러 5개 샘플링
...policy="http-error-policy",sampled="true"} 5
...policy="http-error-policy",sampled="false"} 15

# latency-policy: 고지연 없음
...policy="latency-policy",sampled="false"} 15

# probabilistic-policy: 나머지 15개 중 ~10% 샘플링
...policy="probabilistic-policy",sampled="true"} 2
...policy="probabilistic-policy",sampled="false"} 13
```

### 5.3 현재 메모리의 트레이스 수

```bash
curl -s http://localhost:8888/metrics | grep "sampling_traces_on_memory" | grep -v "^#"
```

**출력:**
```
otelcol_processor_tail_sampling_sampling_traces_on_memory{...} 5
```

→ 현재 `decision_wait` 중인 트레이스 수

### 5.4 한 번에 모든 통계 확인

```bash
echo "=== Tail Sampling Statistics ==="
echo ""
echo "📊 Global Counts:"
curl -s http://localhost:8888/metrics | grep "global_count_traces_sampled" | grep -v "^#" | \
  sed 's/.*decision="\([^"]*\)".*} /\1: /'

echo ""
echo "📋 Policy Execution Counts:"
curl -s http://localhost:8888/metrics | grep "policy_execution_count_total" | grep -v "^#" | \
  sed 's/.*policy="\([^"]*\)".*} /\1: /'

echo ""
echo "💾 Traces in Memory:"
curl -s http://localhost:8888/metrics | grep "traces_on_memory" | grep -v "^#" | \
  sed 's/.*} //'
```

---

## Step 6: HyperDX UI에서 확인

### 6.1 HyperDX 접속

```bash
open http://localhost:8080
```

### 6.2 트레이스 검색

1. **Search** 탭으로 이동
2. 다음 쿼리 실행:
   ```
   service.name:clickstack-demo-backend
   ```

### 6.3 샘플링 검증

**정상 동작 시:**
- 에러가 있는 트레이스 (빨간색) → 모두 표시됨
- 정상 트레이스 → 약 10%만 표시됨

**예상 결과:**
| 요청 타입 | 생성 수 | HyperDX 표시 | 비율 |
|-----------|---------|--------------|------|
| 에러 요청 (4xx/5xx) | 5 | 5 | 100% |
| 정상 요청 | 20 | ~2 | ~10% |

---

## 문제 해결

### 문제 1: Collector가 시작되지 않음

**증상:**
```bash
docker ps --filter "name=otel-collector"
# Exited (1) X seconds ago
```

**해결:**
```bash
# 1. 에러 로그 확인
docker logs clickstack-otel-otel-collector-1 2>&1 | head -20

# 2. 일반적인 에러: 설정 파일 문법 오류
# "cannot unmarshal the configuration" → YAML 문법 검증
cat data/otel-collector/otel-collector-config.yaml | python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)"

# 3. 최신 Collector 버전의 설정 변경
# telemetry.metrics.address 대신 새로운 형식 사용
```

**telemetry 설정 수정 (최신 버전용):**
```yaml
# ❌ 구버전 (에러 발생)
telemetry:
  metrics:
    address: 0.0.0.0:8888

# ✅ 신버전
telemetry:
  metrics:
    level: detailed
    readers:
      - pull:
          exporter:
            prometheus:
              host: "0.0.0.0"
              port: 8888
```

### 문제 2: 트레이스가 Collector에 도달하지 않음

**증상:**
```bash
curl -s http://localhost:8888/metrics | grep "policy_execution_count"
# 모든 값이 0
```

**해결:**
```bash
# 1. Backend가 올바른 엔드포인트를 사용하는지 확인
docker logs clickstack-otel-backend-1 2>&1 | grep "OTLP Target"
# 예상: http://otel-collector:4317

# 2. Backend 재시작 (Collector 시작 후 연결 필요)
docker compose -f docker-compose.yml restart backend

# 3. 네트워크 연결 확인
docker network inspect clickstack-otel_sample | grep -A 5 "Containers"
```

### 문제 3: Clickstack 의존성 문제

**증상:**
```
dependency failed to start: container clickstack is unhealthy
```

**해결:**
```bash
# Clickstack healthcheck 수정 (docker-compose.db.yml)
# /health 엔드포인트가 없으므로 루트 경로 사용
healthcheck:
  test: ["CMD", "curl", "-sf", "http://localhost:8080/"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 60s
```

### 문제 4: 샘플링 비율이 예상과 다름

**증상:**
- 10% 설정인데 20% 샘플링됨

**원인:**
- 적은 샘플 수로 인한 통계적 변동
- 에러/고지연 트레이스가 100% 보존되어 비율 상승

**확인:**
```bash
# 정책별 샘플링 통계 확인
curl -s http://localhost:8888/metrics | grep "count_traces_sampled_total" | grep "probabilistic"
```

---

## 주요 메트릭 참조

### 필수 모니터링 메트릭

| 메트릭 | 설명 | 용도 |
|--------|------|------|
| `global_count_traces_sampled_total{decision="sampled"}` | 샘플링된 트레이스 수 | 전체 샘플링 비율 계산 |
| `global_count_traces_sampled_total{decision="not_sampled"}` | 드롭된 트레이스 수 | 저장 공간 절약량 계산 |
| `sampling_traces_on_memory` | 메모리의 트레이스 수 | 메모리 사용량 모니터링 |
| `sampling_decision_timer_latency_milliseconds` | 샘플링 결정 지연 | 성능 모니터링 |
| `policy_execution_count_total` | 정책별 실행 횟수 | 정책 동작 확인 |

### 메트릭 수집 명령어

```bash
# 전체 tail_sampling 메트릭
curl -s http://localhost:8888/metrics | grep tail_sampling

# 샘플링 비율 계산
sampled=$(curl -s http://localhost:8888/metrics | grep 'global_count_traces_sampled_total{decision="sampled"' | awk '{print $NF}')
not_sampled=$(curl -s http://localhost:8888/metrics | grep 'global_count_traces_sampled_total{decision="not_sampled"' | awk '{print $NF}')
echo "Sampling rate: $(echo "scale=2; $sampled / ($sampled + $not_sampled) * 100" | bc)%"
```

### zPages 디버깅 UI

```bash
# 브라우저에서 열기
open http://localhost:55679/debug/tracez     # 트레이스 디버깅
open http://localhost:55679/debug/pipelinez  # 파이프라인 상태
```

---

## 요약: Quick Check 스크립트

아래 스크립트를 실행하면 전체 상태를 한 번에 확인할 수 있습니다:

```bash
#!/bin/bash
echo "🔍 OTEL Collector Tail Sampling Status Check"
echo "============================================="
echo ""

# 1. Health Check
echo "1️⃣ Health Check:"
health=$(curl -s http://localhost:13133/ 2>/dev/null)
if [[ $health == *"Server available"* ]]; then
  echo "   ✅ Collector is healthy"
else
  echo "   ❌ Collector is not responding"
  exit 1
fi

# 2. Policy Status
echo ""
echo "2️⃣ Loaded Policies:"
curl -s http://localhost:8888/metrics 2>/dev/null | grep "policy_execution_count_total" | grep -v "^#" | \
  sed 's/.*policy="\([^"]*\)".*}/   ✅ \1/'

# 3. Sampling Statistics
echo ""
echo "3️⃣ Sampling Statistics:"
sampled=$(curl -s http://localhost:8888/metrics 2>/dev/null | grep 'global_count_traces_sampled_total{decision="sampled"' | awk '{print $NF}')
not_sampled=$(curl -s http://localhost:8888/metrics 2>/dev/null | grep 'global_count_traces_sampled_total{decision="not_sampled"' | awk '{print $NF}')

if [[ -n "$sampled" && -n "$not_sampled" ]]; then
  total=$((sampled + not_sampled))
  if [[ $total -gt 0 ]]; then
    rate=$(echo "scale=1; $sampled * 100 / $total" | bc)
    echo "   📊 Sampled: $sampled"
    echo "   📊 Dropped: $not_sampled"
    echo "   📊 Rate: ${rate}%"
  else
    echo "   ⏳ No traces processed yet"
  fi
else
  echo "   ⏳ No data available yet"
fi

# 4. Memory Usage
echo ""
echo "4️⃣ Traces in Memory:"
memory=$(curl -s http://localhost:8888/metrics 2>/dev/null | grep "sampling_traces_on_memory" | grep -v "^#" | awk '{print $NF}')
echo "   💾 ${memory:-0} traces waiting for decision"

echo ""
echo "============================================="
echo "✅ Check complete!"
```

파일로 저장하고 실행:
```bash
chmod +x check-tail-sampling.sh
./check-tail-sampling.sh
```

---

## 참고 자료

- [OpenTelemetry Collector Tail Sampling Processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)
- [Tail Sampling Configuration Reference](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/tailsamplingprocessor/README.md)
- [OTEL Collector Troubleshooting](https://opentelemetry.io/docs/collector/troubleshooting/)
