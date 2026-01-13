# ClickStack 데이터 플로우 설명서

이 문서는 **Logs, Metrics, Traces, Session Replay** 데이터가 어떻게 ClickStack을 통해 ClickHouse에 저장되는지 설명합니다.
디테일한 flow보단 전체적으로 개략적인 flow를 설명합니다.

## 목차

1. [ClickStack 아키텍처 개요](#clickstack-아키텍처-개요)
2. [데이터 플로우 다이어그램](#데이터-플로우-다이어그램)
3. [각 Signal별 상세 플로우](#각-signal별-상세-플로우)
   - [Logs (로그)](#1-logs-로그)
   - [Metrics (메트릭)](#2-metrics-메트릭)
   - [Traces (트레이스)](#3-traces-트레이스)
   - [Session Replay (세션 리플레이)](#4-session-replay-세션-리플레이)
4. [OTLP 프로토콜](#otlp-프로토콜)
5. [ClickHouse 스키마](#clickhouse-스키마)
6. [코드에서의 구현](#코드에서의-구현)
7. [Tail-Based Sampling 아키텍처](#tail-based-sampling-아키텍처)

---

## ClickStack 아키텍처 개요

ClickStack은 3개의 핵심 컴포넌트로 구성됩니다:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            ClickStack                                   │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   HyperDX UI    │    │  OpenTelemetry  │    │   ClickHouse    │     │
│  │                 │◄───│    Collector    │───►│                 │     │
│  │  - Search       │    │                 │    │  - Logs Table   │     │
│  │  - Dashboards   │    │  - Receives     │    │  - Traces Table │     │
│  │  - Traces       │    │    OTLP data    │    │  - Metrics Table│     │
│  │  - Sessions     │    │  - Batches      │    │  - Sessions     │     │
│  │  - Alerts       │    │  - Transforms   │    │    Table        │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                         │
│  ┌─────────────────┐                                                    │
│  │    MongoDB      │  ← 대시보드, 알림, 사용자 설정 저장                   │
│  └─────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

| 컴포넌트 | 역할 |
|---------|------|
| **HyperDX UI** | 웹 기반 UI로 로그 검색, 트레이스 탐색, 대시보드, 세션 리플레이 제공 |
| **OpenTelemetry Collector** | OTLP 프로토콜로 데이터 수신, 배치 처리 후 ClickHouse에 저장 |
| **ClickHouse** | 고성능 컬럼형 데이터베이스, 모든 telemetry 데이터의 중앙 저장소 |
| **MongoDB** | 애플리케이션 상태 (대시보드, 알림, 사용자 계정) 저장 |

---

## 데이터 플로우 다이어그램

### 전체 플로우

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              YOUR APPLICATION                                    │
├─────────────────────────────────┬───────────────────────────────────────────────┤
│         Backend (NestJS)        │              Frontend (React)                 │
│                                 │                                               │
│  ┌───────────────────────────┐  │  ┌───────────────────────────────────────┐   │
│  │ Vanilla OpenTelemetry SDK │  │  │     @hyperdx/browser SDK              │   │
│  │ + Pino Logger             │  │  │                                       │   │
│  │ • Pino logs → OTLP Logs   │  │  │ • User clicks → Session Replay        │   │
│  │ • Traces (auto)           │  │  │ • console.log → Logs                  │   │
│  │ • Custom Metrics          │  │  │ • Fetch requests → Traces             │   │
│  │ • Exceptions              │  │  │ • Errors → Exceptions                 │   │
│  └───────────────┬───────────┘  │  └───────────────────┬───────────────────┘   │
│                  │              │                      │                        │
└──────────────────┼──────────────┴──────────────────────┼────────────────────────┘
                   │                                     │
                   │ OTLP/gRPC (4317)                    │ OTLP/HTTP (4318)
                   │ or OTLP/HTTP (4318)                 │
                   │                                     │
                   ▼                                     ▼
          ┌────────────────────────────────────────────────────────┐
          │              OpenTelemetry Collector                    │
          │                                                         │
          │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
          │  │  Receivers  │  │ Processors  │  │  Exporters  │     │
          │  │             │  │             │  │             │     │
          │  │  - OTLP     │─▶│  - Batch    │─▶│ - ClickHouse│     │
          │  │    (gRPC)   │  │  - Memory   │  │   Exporter  │     │
          │  │  - OTLP     │  │    Limiter  │  │             │     │
          │  │    (HTTP)   │  │             │  │             │     │
          │  └─────────────┘  └─────────────┘  └─────────────┘     │
          └────────────────────────────────────────────────────────┘
                                      │
                                      │ Batched Inserts
                                      ▼
          ┌────────────────────────────────────────────────────────┐
          │                     ClickHouse                          │
          │                                                         │
          │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
          │  │ otel_logs   │ │ otel_traces │ │otel_metrics │       │
          │  │             │ │             │ │             │       │
          │  │ Timestamp   │ │ TraceId     │ │ Timestamp   │       │
          │  │ Body        │ │ SpanId      │ │ MetricName  │       │
          │  │ SeverityText│ │ ParentSpanId│ │ Value       │       │
          │  │ Attributes  │ │ Duration    │ │ Attributes  │       │
          │  │ Resource    │ │ Attributes  │ │ Resource    │       │
          │  └─────────────┘ └─────────────┘ └─────────────┘       │
          │                                                         │
          │  ┌─────────────────────────────────────────────────┐   │
          │  │                  otel_sessions                   │   │
          │  │                                                  │   │
          │  │  SessionId | Events (clicks, scrolls, inputs)   │   │
          │  │  Timestamp | DOM Snapshots | Network Requests   │   │
          │  └─────────────────────────────────────────────────┘   │
          └────────────────────────────────────────────────────────┘
                                      │
                                      │ SQL Queries
                                      ▼
          ┌────────────────────────────────────────────────────────┐
          │                     HyperDX UI                          │
          │                                                         │
          │    Search (Logs)  │  Traces  │  Dashboards  │  Sessions │
          └────────────────────────────────────────────────────────┘
```

---

## 각 Signal별 상세 플로우

### 1. Logs (로그)

#### 플로우

```
logger.info({ taskId }, 'Task created')
       │
       ▼
┌──────────────────────────┐
│ Pino Logger              │
│ - JSON 형식 로그 생성    │
│ - traceContextMixin()    │
│   으로 traceId, spanId   │
│   자동 추가              │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│ LogRecord 생성:          │
│ - timestamp              │
│ - severity (info/warn/   │
│   error)                 │
│ - body (메시지)          │
│ - attributes             │
│ - traceId (자동 추가!)   │
│ - spanId (자동 추가!)    │
└──────────────┬───────────┘
               │ OTLP
               ▼
┌──────────────────────────┐
│ OTel Collector           │
│ - 배치로 모음            │
│ - ClickHouse 포맷 변환   │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│ ClickHouse: otel_logs    │
│ 테이블에 INSERT          │
└──────────────────────────┘
```

#### 로그 레벨 매핑

| Pino 메서드 | Severity | SeverityNumber |
|------------|----------|----------------|
| logger.trace() | TRACE | 1 |
| logger.debug() | DEBUG | 5 |
| logger.info() | INFO | 9 |
| logger.warn() | WARN | 13 |
| logger.error() | ERROR | 17 |
| logger.fatal() | FATAL | 21 |

#### 코드 예시

```typescript
import { logger } from './logger';

// Pino 로거 사용 - traceId, spanId 자동 포함!
logger.info({ taskId: '123', title: 'Learn ClickStack' }, 'Task created');
// 출력 (JSON):
// {
//   "level": "info",
//   "time": "2024-01-15T10:30:00.000Z",
//   "msg": "Task created",
//   "taskId": "123",
//   "title": "Learn ClickStack",
//   "traceId": "abc123...",  ← 자동 추가!
//   "spanId": "def456..."    ← 자동 추가!
// }

logger.error({ err: error }, 'Operation failed');
// → severity: ERROR로 저장됨, 스택 트레이스 포함
```

---

### 2. Metrics (메트릭)

#### 플로우

```
meter.createCounter('requests.total')
counter.add(1, { method: 'GET' })
              │
              ▼
┌──────────────────────────┐
│ Metric Data Point 생성:  │
│ - name: requests.total   │
│ - value: 1               │
│ - attributes: {method}   │
│ - timestamp              │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ PeriodicExporting        │
│ MetricReader             │
│ (10초마다 내보냄)         │
└──────────────┬───────────┘
              │ OTLP
              ▼
┌──────────────────────────┐
│ OTel Collector           │
│ - 집계 (Aggregation)     │
│ - 배치 처리              │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ ClickHouse: otel_metrics │
│ 테이블에 INSERT          │
└──────────────────────────┘
```

#### 메트릭 타입

| 타입 | 설명 | 예시 |
|------|------|------|
| **Counter** | 증가만 가능한 누적 값 | 요청 수, 에러 수 |
| **Histogram** | 값 분포 측정 | 응답 시간, 요청 크기 |
| **UpDownCounter** | 증가/감소 가능 | 활성 연결 수, 큐 크기 |
| **Gauge** | 현재 값 (스냅샷) | CPU 사용률, 메모리 |

#### 코드 예시

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('tasks-service');

// Counter - 누적 카운터
const requestCounter = meter.createCounter('tasks.operations.total');
requestCounter.add(1, { operation: 'create', status: 'success' });

// Histogram - 분포 측정
const durationHistogram = meter.createHistogram('tasks.operation.duration');
durationHistogram.record(150, { operation: 'create' }); // 150ms

// UpDownCounter - 증감 가능
const activeTasksGauge = meter.createUpDownCounter('tasks.active.count');
activeTasksGauge.add(1);  // 태스크 생성 시
activeTasksGauge.add(-1); // 태스크 삭제 시
```

---

### 3. Traces (트레이스)

#### 플로우

```
HTTP Request: GET /tasks
              │
              ▼
┌──────────────────────────┐
│ Auto-Instrumentation     │
│ (HTTP, Express, NestJS)  │
│ 자동으로 Span 생성       │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ Root Span 생성:          │
│ - traceId: abc123...     │
│ - spanId: def456...      │
│ - name: GET /tasks       │
│ - startTime              │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ 서비스 로직 실행         │
│ (커스텀 Span 추가 가능)   │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ Child Span:              │
│ - spanId: ghi789...      │
│ - parentSpanId: def456   │
│ - name: tasks.getAll     │
│ - attributes             │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ Span 종료 + 내보내기     │
│ - endTime                │
│ - duration 계산          │
│ - status (OK/ERROR)      │
└──────────────┬───────────┘
              │ OTLP
              ▼
┌──────────────────────────┐
│ OTel Collector           │
│ - 배치 처리              │
└──────────────┬───────────┘
              │
              ▼
┌──────────────────────────┐
│ClickHouse: otel_traces   │
│ (spans 테이블)           │
└──────────────────────────┘
```

#### Trace 구조

```
Trace (traceId: abc123)
│
├── Span: GET /tasks (root span)
│   ├── spanId: def456
│   ├── duration: 250ms
│   ├── status: OK
│   │
│   └── Child Span: tasks.getAll
│       ├── spanId: ghi789
│       ├── parentSpanId: def456
│       ├── duration: 180ms
│       └── attributes:
│           └── tasks.count: 3
│
└── Span: DB Query (auto-instrumented)
    ├── spanId: jkl012
    ├── parentSpanId: ghi789
    └── duration: 50ms
```

#### 코드 예시

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('tasks-service');

async function getAllTasks() {
  // 커스텀 스팬 생성
  return tracer.startActiveSpan('tasks.getAll', async (span) => {
    try {
      const tasks = await db.query('SELECT * FROM tasks');
      
      // 스팬에 속성 추가
      span.setAttribute('tasks.count', tasks.length);
      span.setStatus({ code: SpanStatusCode.OK });
      
      return tasks;
    } catch (error) {
      // 에러 기록
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end(); // 스팬 종료 (duration 계산)
    }
  });
}
```

#### TracingInterceptor (NestJS 전역 인터셉터)

모든 HTTP 요청에 자동으로 스팬을 생성하는 인터셉터입니다:

```
HTTP Request: GET /tasks
              │
              ▼
┌──────────────────────────┐
│ TracingInterceptor       │
│                          │
│ span name:               │
│   TasksController.getAll │
│                          │
│ attributes:              │
│   - http.method: GET     │
│   - http.url: /tasks     │
│   - code.class           │
│   - code.function        │
│   - http.duration_ms     │
└──────────────────────────┘
```

```typescript
// interceptors/tracing.interceptor.ts
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const className = context.getClass().name;
    const handlerName = context.getHandler().name;
    const spanName = `${className}.${handlerName}`;

    return tracer.startActiveSpan(spanName, { kind: SpanKind.SERVER }, (span) => {
      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'code.class': className,
        'code.function': handlerName,
      });

      return next.handle().pipe(
        tap(() => {
          span.setAttribute('http.duration_ms', Date.now() - startTime);
          span.setStatus({ code: SpanStatusCode.OK });
        }),
        catchError((error) => {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException(error);
          throw error;
        }),
        finalize(() => span.end()),
      );
    });
  }
}
```

#### GlobalExceptionFilter (전역 에러 필터)

모든 에러 응답에 `traceId`를 포함시켜 디버깅을 용이하게 합니다:

```
Error 발생
    │
    ▼
┌──────────────────────────┐
│ GlobalExceptionFilter    │
│                          │
│ - 현재 스팬에서 traceId  │
│   추출                   │
│ - 에러 로깅 (warn/error) │
│ - 응답에 traceId 포함    │
└──────────────────────────┘
    │
    ▼
{
  "statusCode": 500,
  "message": "Database error",
  "traceId": "abc123..."  ← 디버깅용!
}
```

```typescript
// filters/http-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 현재 활성 스팬에서 traceId 추출
    const traceId = trace.getSpan(context.active())?.spanContext()?.traceId;

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // 5xx는 error, 4xx는 warn 레벨로 로깅
    if (status >= 500) {
      this.logger.error(exception, 'Internal server error');
    } else {
      this.logger.warn({ statusCode: status, path: request.url }, 'Client error');
    }

    response.status(status).json({
      statusCode: status,
      message: this.getErrorMessage(exception),
      timestamp: new Date().toISOString(),
      path: request.url,
      traceId,  // 디버깅을 위한 traceId 포함!
    });
  }
}
```

> 💡 **Tip**: 사용자가 에러를 보고하면 `traceId`로 ClickStack에서 전체 요청 컨텍스트(로그, 트레이스, 관련 스팬)를 검색할 수 있습니다.

---

### 4. Session Replay (세션 리플레이)

#### 플로우

```
사용자가 페이지 로드
         │
         ▼
┌──────────────────────────┐
│ HyperDX Browser SDK      │
│ 초기화                   │
│ - DOM 스냅샷 캡처        │
│ - 이벤트 리스너 등록     │
└──────────────┬───────────┘
         │
         ▼
┌──────────────────────────┐
│ 사용자 상호작용 캡처:    │
│ - 클릭 이벤트            │
│ - 스크롤 위치            │
│ - 입력 (마스킹됨)        │
│ - 페이지 이동            │
│ - 네트워크 요청          │
│ - 콘솔 로그              │
│ - 에러                   │
└──────────────┬───────────┘
         │
         ▼
┌──────────────────────────┐
│ DOM 변경 감지            │
│ (MutationObserver)       │
│ - 증분 스냅샷 생성       │
└──────────────┬───────────┘
         │ 배치 전송 (주기적)
         ▼
┌──────────────────────────┐
│ OTLP HTTP (4318)         │
│ - 세션 이벤트 전송       │
└──────────────┬───────────┘
         │
         ▼
┌──────────────────────────┐
│ OTel Collector           │
└──────────────┬───────────┘
         │
         ▼
┌──────────────────────────┐
│ ClickHouse:              │
│ otel_sessions 테이블     │
│                          │
│ - sessionId              │
│ - userId (optional)      │
│ - events (JSON)          │
│ - domSnapshots           │
│ - networkRequests        │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ HyperDX UI: Sessions 탭  │
│                          │
│ - 세션 목록              │
│ - 비디오처럼 재생        │
│ - 에러 발생 지점 표시    │
│ - 네트워크 타임라인      │
└──────────────────────────┘
```

#### 캡처되는 데이터

| 데이터 타입 | 설명 |
|------------|------|
| DOM Snapshots | 초기 DOM + 증분 변경사항 (rrweb 형식) |
| Mouse Events | 클릭, 이동, 스크롤 좌표 |
| Input Events | 키보드 입력 (민감 정보 마스킹) |
| Network Requests | fetch/XHR 요청 + 응답 시간 |
| Console Logs | 브라우저 콘솔 출력 |
| Errors | JavaScript 에러 + 스택 트레이스 |

#### 코드 예시

```typescript
// frontend/src/hyperdx.ts
import HyperDX from '@hyperdx/browser';

const HYPERDX_API_KEY = import.meta.env.VITE_HYPERDX_API_KEY;
const OTEL_ENDPOINT = import.meta.env.VITE_OTEL_ENDPOINT;  // 커스텀 엔드포인트!

HyperDX.init({
  apiKey: HYPERDX_API_KEY,
  service: 'clickstack-demo-frontend',

  // 세션 리플레이 옵션
  consoleCapture: true,           // console.log 자동 캡처
  advancedNetworkCapture: true,   // 네트워크 요청 상세 정보 캡처

  // Trace Propagation (Backend와 연결)
  tracePropagationTargets: [/localhost:3000/i, /api/i],

  // 벤더 중립성: 커스텀 OTLP 엔드포인트 지정 가능!
  url: OTEL_ENDPOINT,
});

// 커스텀 이벤트 추가
HyperDX.addAction('Button Clicked', { buttonId: 'submit-task' });

// 에러 기록
HyperDX.recordException(new Error('Something went wrong'), {
  context: 'task-creation',
});
```

---

## OTLP 프로토콜

> **이 프로젝트의 선택**: Backend는 **gRPC (4317)**를 사용합니다.
> 성능 우위와 persistent connection의 장점을 활용합니다.
> Frontend는 브라우저 환경이므로 **HTTP (4318)**를 사용합니다.

### OTLP gRPC vs HTTP 비교

| 특성 | OTLP gRPC (4317) | OTLP HTTP (4318) |
|------|------------------|------------------|
| 프로토콜 | HTTP/2 + Protobuf | HTTP/1.1 + JSON/Protobuf |
| 성능 | 더 빠름 (바이너리, 멀티플렉싱) | 상대적으로 느림 |
| 연결 | Persistent (연결 재사용) | Request per connection |
| 브라우저 지원 | ❌ | ✅ |
| 디버깅 | 어려움 (바이너리) | 쉬움 (JSON) |
| 방화벽 | 일부 환경에서 차단 | 대부분 통과 |
| **이 프로젝트** | **Backend 사용** | **Frontend 사용** |

### 엔드포인트 구조

```
HTTP (4318):
  POST /v1/traces   → 트레이스 데이터
  POST /v1/metrics  → 메트릭 데이터
  POST /v1/logs     → 로그 데이터

gRPC (4317):
  opentelemetry.proto.collector.trace.v1.TraceService/Export
  opentelemetry.proto.collector.metrics.v1.MetricsService/Export
  opentelemetry.proto.collector.logs.v1.LogsService/Export
```

### NPM 패키지 (gRPC vs HTTP)

```bash
# gRPC Exporters (이 프로젝트에서 사용)
@opentelemetry/exporter-trace-otlp-grpc
@opentelemetry/exporter-metrics-otlp-grpc
@opentelemetry/exporter-logs-otlp-grpc

# HTTP Exporters (브라우저 또는 방화벽 제한 환경용)
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/exporter-metrics-otlp-http
@opentelemetry/exporter-logs-otlp-http
```

> **gRPC 전환 방법**: 패키지를 `-grpc`로 변경하고, exporter URL에서 경로(`/v1/traces` 등)를 제거하면 됩니다. gRPC는 서비스 메서드를 사용하므로 별도의 경로 지정이 필요 없습니다.

---

## ClickHouse 스키마

ClickStack은 ClickHouse에 다음과 같은 테이블들을 생성합니다:

### otel_logs 테이블

```sql
CREATE TABLE otel_logs (
  Timestamp DateTime64(9),
  TraceId String,
  SpanId String,
  SeverityText String,
  SeverityNumber UInt8,
  Body String,
  ResourceAttributes Map(String, String),
  LogAttributes Map(String, String),
  -- ... 추가 컬럼
) ENGINE = MergeTree()
ORDER BY (Timestamp, TraceId);
```

### otel_traces 테이블

```sql
CREATE TABLE otel_traces (
  Timestamp DateTime64(9),
  TraceId String,
  SpanId String,
  ParentSpanId String,
  SpanName String,
  SpanKind String,
  Duration UInt64,
  StatusCode String,
  ResourceAttributes Map(String, String),
  SpanAttributes Map(String, String),
  -- ... 추가 컬럼
) ENGINE = MergeTree()
ORDER BY (Timestamp, TraceId);
```

---

## 코드에서의 구현

### Backend (NestJS) - Vendor-neutral

```typescript
// 1. SDK 초기화 (main.ts 최상단에서 import)
import './tracing';

// 2. tracing.ts - Vanilla OpenTelemetry (벤더 중립!)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';

// gRPC는 URL 경로가 필요 없음 - 엔드포인트만 지정
const traceExporter = new OTLPTraceExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,  // e.g., http://otel-collector:4317
  headers,
});

const metricExporter = new OTLPMetricExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,
  headers,
});

const logExporter = new OTLPLogExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,
  headers,
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 5_000,
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(logExporter),
  ],
  // ... auto-instrumentations
});
sdk.start();

// 3. Pino 로거 사용 (traceId, spanId 자동 포함!)
import { logger } from './logger';
logger.info({ taskId }, 'Task created');  // → OTLP로 ClickStack에 전송

// 4. 커스텀 트레이스
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('my-service');

tracer.startActiveSpan('my-operation', (span) => {
  // ... 로직
  span.end();
});

// 5. 커스텀 메트릭
import { metrics } from '@opentelemetry/api';
const meter = metrics.getMeter('my-service');
const counter = meter.createCounter('requests.total');
counter.add(1);
```

### Frontend (React)

```typescript
// 1. SDK 초기화 (main.tsx 최상단에서 import)
import './hyperdx';

// 2. hyperdx.ts
import HyperDX from '@hyperdx/browser';

HyperDX.init({
  apiKey: import.meta.env.VITE_HYPERDX_API_KEY,
  service: 'clickstack-demo-frontend',
  tracePropagationTargets: [/localhost:3000/i, /api/i],
  consoleCapture: true,
  advancedNetworkCapture: true,
  url: import.meta.env.VITE_OTEL_ENDPOINT,  // 커스텀 엔드포인트!
});

// 3. 컴포넌트에서 사용
console.log('Button clicked');  // → 자동으로 ClickStack에 전송

// 4. 커스텀 액션 추가 (세션 리플레이에서 마커로 표시)
HyperDX.addAction('User logged in', { userId: '123' });

// 5. 에러 기록
try {
  await riskyOperation();
} catch (error) {
  HyperDX.recordException(error);
}
```

---

## 요약: 각 Signal의 여정

```
┌─────────────────────────────────────────────────────────────────────┐
│                        데이터 생성                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Logs     : console.log() 호출                                       │
│ Metrics  : counter.add(), histogram.record()                        │
│ Traces   : HTTP 요청 또는 tracer.startActiveSpan()                  │
│ Sessions : 사용자 클릭, 스크롤, 입력                                 │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SDK 처리                                      │
├─────────────────────────────────────────────────────────────────────┤
│ OpenTelemetry SDK가 데이터를 OTLP 형식으로 변환                      │
│ - LogRecord, Span, Metric DataPoint 생성                            │
│ - Resource Attributes 추가 (service.name, etc.)                     │
│ - 배치로 모음                                                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ OTLP (HTTP/gRPC)
┌─────────────────────────────────────────────────────────────────────┐
│                   OpenTelemetry Collector                            │
├─────────────────────────────────────────────────────────────────────┤
│ Receivers → Processors → Exporters                                   │
│ - OTLP 수신                                                          │
│ - 배치 처리                                                          │
│ - ClickHouse 포맷으로 변환                                           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ Batched INSERT
┌─────────────────────────────────────────────────────────────────────┐
│                        ClickHouse                                    │
├─────────────────────────────────────────────────────────────────────┤
│ 각 Signal별 테이블에 저장:                                           │
│ - otel_logs (로그)                                                   │
│ - otel_traces (트레이스/스팬)                                        │
│ - otel_metrics (메트릭)                                              │
│ - otel_sessions (세션 리플레이)                                      │
│                                                                      │
│ 컬럼형 저장 → 90%+ 압축률, 빠른 분석 쿼리                            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ SQL Query
┌─────────────────────────────────────────────────────────────────────┐
│                        HyperDX UI                                    │
├─────────────────────────────────────────────────────────────────────┤
│ - Search: 로그 검색 (Lucene 또는 SQL)                                │
│ - Traces: 분산 추적 시각화                                           │
│ - Dashboards: 메트릭 차트                                            │
│ - Sessions: 세션 리플레이 재생                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tail-Based Sampling 아키텍처

### 듀얼 Collector 구조

`hyperdx-all-in-one` 이미지에는 이미 **내장 OTEL Collector**가 포함되어 있습니다. 우리는 tail-based sampling을 위해 **외부 Collector**를 추가했으므로, 현재 두 개의 Collector가 직렬로 연결되어 있습니다:

```
┌──────────┐     ┌─────────────────────┐     ┌─────────────────────────────────────┐
│ Backend  │ ──► │ External Collector  │ ──► │      hyperdx-all-in-one             │
│          │     │ (tail sampling)     │     │  ┌─────────────────────────────────┐│
│  100%    │     │                     │     │  │ Embedded OTEL Collector        ││
│ traces   │     │  Policies:          │     │  │ (ingestion only)               ││
│          │     │  - ERROR → 100%     │     │  └──────────┬──────────────────────┘│
│          │     │  - Latency >1s      │     │             ▼                       │
│          │     │  - HTTP 4xx/5xx     │     │  ┌─────────────────────────────────┐│
│          │     │  - Normal → 10%     │     │  │       ClickHouse               ││
│          │     │                     │     │  └─────────────────────────────────┘│
└──────────┘     └─────────────────────┘     └─────────────────────────────────────┘
    gRPC:4317         ~10-20% 전달              HTTP:4318 (내부)
```

### 왜 두 개의 Collector가 필요한가?

| 측면 | External Collector | Embedded Collector |
|------|-------------------|-------------------|
| **역할** | 샘플링, 필터링 | 데이터 수집, 저장 |
| **CPU 사용** | 높음 (샘플링 로직) | 낮음 (단순 전달) |
| **설정** | 우리가 제어 | HyperDX 관리 |
| **확장성** | 독립적 스케일링 가능 | HyperDX와 함께 |

### 이 구조의 장점

1. **관심사의 분리**: 샘플링 로직이 저장소와 분리됨
2. **유연성**: HyperDX 설정 변경 없이 샘플링 정책 수정 가능
3. **확장성**: 외부 Collector를 독립적으로 스케일링 가능
4. **일반적인 패턴**: 프로덕션 관측성 파이프라인의 표준 구조

### Tail-Based Sampling 정책

외부 Collector (`otel-collector-config.yaml`)에서 다음 정책을 적용합니다:

```yaml
tail_sampling:
  decision_wait: 10s        # 트레이스 완료 대기 시간
  num_traces: 50000         # 메모리에 보관할 최대 트레이스 수
  policies:
    # 1. 에러가 있는 트레이스는 항상 보존 (100%)
    - name: errors-policy
      type: status_code
      status_code:
        status_codes: [ERROR]

    # 2. 지연 시간이 긴 트레이스 보존 (latency > 2s)
    - name: latency-policy
      type: latency
      latency:
        threshold_ms: 2000

    # 3. HTTP 에러 코드 보존 (4xx, 5xx)
    - name: http-error-policy
      type: string_attribute
      string_attribute:
        key: http.response.status_code
        values: ["400", "500", "502", "503", "504"]

    # 4. 정상 트레이스는 10% 샘플링
    - name: probabilistic-policy
      type: probabilistic
      probabilistic:
        sampling_percentage: 10
```

### Head-Based vs Tail-Based Sampling

| 측면 | Head-Based (SDK) | Tail-Based (Collector) |
|------|-----------------|------------------------|
| **결정 시점** | Span 시작 시 | Trace 완료 후 |
| **에러 캡처** | 놓칠 수 있음 | **100% 보장** |
| **네트워크 트래픽** | 감소 (소스에서 필터링) | 100% 전송 |
| **트레이스 완전성** | 부분적 (부모 span 누락 가능) | **완전함** |
| **메모리 사용** | 낮음 | 높음 (대기 중인 트레이스 보관) |

```
Head-Based 문제점:

  Parent Span Start ─────────────────────────► Parent End (10% 확률로 drop)
       │
       └── Child Span Start ──► Error! ──► Child End (error이므로 keep)

  결과: Child span만 있고 Parent span이 없는 불완전한 트레이스!

Tail-Based 해결:

  Parent Span Start ─────────────────────────► Parent End ──┐
       │                                                    │
       └── Child Span Start ──► Error! ──► Child End ──────┼─► Collector
                                                            │
                                            decision_wait 후 │
                                            전체 트레이스 평가 │
                                                            ▼
                                            "에러 있음 → 전체 보존!"
```

### 데이터 플로우 요약

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (NestJS)                              │
├─────────────────────────────────────────────────────────────────────┤
│  100% Traces 생성 (샘플링 없음)                                       │
│  → 모든 요청에 대해 완전한 트레이스 데이터 생성                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ OTLP gRPC (4317)
┌─────────────────────────────────────────────────────────────────────┐
│                   External OTEL Collector                            │
├─────────────────────────────────────────────────────────────────────┤
│  Tail-Based Sampling:                                                │
│  - 10초 대기 (decision_wait)                                         │
│  - 트레이스 완료 후 정책 평가                                         │
│  - ERROR, 고지연, HTTP 에러 → 100% 보존                              │
│  - 정상 → 10% 샘플링                                                 │
│                                                                      │
│  결과: ~10-20% 데이터만 다음 단계로 전달                              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ OTLP HTTP (4318)
┌─────────────────────────────────────────────────────────────────────┐
│                   HyperDX (hyperdx-all-in-one)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Embedded OTEL Collector                                      │    │
│  │ - 이미 샘플링된 데이터 수신                                   │    │
│  │ - 추가 처리 없이 ClickHouse로 전달                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ClickHouse                                                   │    │
│  │ - 샘플링된 트레이스만 저장                                    │    │
│  │ - 스토리지 80-90% 절감                                        │    │
│  │ - 에러 트레이스는 100% 보존                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Log Sampling 아키텍처

Trace 샘플링과 별도로, 로그도 severity 기반 샘플링이 적용됩니다.

### 왜 Logs에는 Tail-Based Sampling을 사용하지 않는가?

| 측면 | Traces | Logs |
|------|--------|------|
| **데이터 구조** | 부모-자식 관계 (TraceId로 연결) | 독립적인 이벤트 |
| **결정 시점** | 전체 트레이스 완료 후 | 즉시 결정 가능 |
| **샘플링 방식** | `tail_sampling` processor | `routing` connector + `probabilistic_sampler` |

로그는 트레이스와 달리 스팬 간의 부모-자식 관계가 없으므로, 완료를 기다릴 필요 없이 severity에 따라 즉시 라우팅할 수 있습니다.

### Log Sampling 플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (NestJS)                              │
├─────────────────────────────────────────────────────────────────────┤
│  100% Logs 생성                                                      │
│  - logger.info("Task created")  → severity: INFO (9)                │
│  - logger.error("DB failed")    → severity: ERROR (17)              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ OTLP gRPC (4317)
┌─────────────────────────────────────────────────────────────────────┐
│                   External OTEL Collector                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  logs pipeline (entry):                                              │
│    receivers: [otlp]                                                 │
│    processors: [memory_limiter]                                      │
│    exporters: [routing/logs]  ← Connector로 분기                     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  routing/logs Connector                      │    │
│  │                                                              │    │
│  │  condition: severity_number >= SEVERITY_NUMBER_ERROR (17)   │    │
│  │                                                              │    │
│  │       severity >= ERROR         severity < ERROR            │    │
│  │            │                          │                      │    │
│  │            ▼                          ▼                      │    │
│  │      logs/errors               logs/normal                   │    │
│  │      (100% 보존)               (10% 샘플링)                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  logs/errors pipeline:                                               │
│    receivers: [routing/logs]                                         │
│    processors: [batch]                                               │
│    exporters: [otlphttp/clickstack]                                  │
│                                                                      │
│  logs/normal pipeline:                                               │
│    receivers: [routing/logs]                                         │
│    processors: [probabilistic_sampler/logs, batch]  ← 10% 샘플링    │
│    exporters: [otlphttp/clickstack]                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ OTLP HTTP (4318)
┌─────────────────────────────────────────────────────────────────────┐
│                        ClickStack (HyperDX)                          │
├─────────────────────────────────────────────────────────────────────┤
│  - ERROR/FATAL 로그: 100% 저장 (중요 이슈 절대 누락 없음)            │
│  - INFO/DEBUG/WARN 로그: ~10% 저장 (스토리지 최적화)                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Severity Number 매핑

| Log Level | Severity Number | 라우팅 결과 |
|-----------|----------------|------------|
| TRACE | 1-4 | logs/normal → 10% 샘플링 |
| DEBUG | 5-8 | logs/normal → 10% 샘플링 |
| INFO | 9-12 | logs/normal → 10% 샘플링 |
| WARN | 13-16 | logs/normal → 10% 샘플링 |
| **ERROR** | 17-20 | **logs/errors → 100% 보존** |
| **FATAL** | 21-24 | **logs/errors → 100% 보존** |

### Log Sampling 설정

```yaml
# Probabilistic Sampler (정상 로그용)
processors:
  probabilistic_sampler/logs:
    sampling_percentage: 10
    hash_seed: 42

# Routing Connector (severity 기반 분기)
connectors:
  routing/logs:
    default_pipelines: [logs/normal]
    error_mode: ignore
    table:
      - context: log
        condition: severity_number >= SEVERITY_NUMBER_ERROR
        pipelines: [logs/errors]
```

> **Note**: `context: log`를 지정해야 `severity_number` 필드에 접근할 수 있습니다.

---

### 설정 파일

| 파일 | 용도 |
|------|------|
| `otel-collector-config.yaml` | 외부 Collector 설정 (tail-based sampling + log sampling 정책) |
| `docker-compose.db.yml` | 서비스 정의 (otel-collector, clickstack) |
| `backend/.env` | SDK 엔드포인트 설정 (`otel-collector:4317`) |

### 검증 방법

```bash
# 1. 서비스 시작
docker-compose -f docker-compose.db.yml up -d

# 2. Collector 상태 확인
curl http://localhost:13133/  # Health check
curl http://localhost:8888/metrics  # Collector 메트릭

# 3. HyperDX UI에서 확인
# http://localhost:8080
# - 에러 요청 → 항상 표시됨
# - 정상 요청 → ~10%만 표시됨
```

---

## 참고 자료

- [ClickStack 공식 문서](https://clickhouse.com/docs/use-cases/observability/clickstack/overview)
- [OpenTelemetry 스펙](https://opentelemetry.io/docs/specs/otel/)
- [OpenTelemetry Collector Tail Sampling](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)
- [HyperDX GitHub](https://github.com/hyperdxio/hyperdx)
- [ClickHouse 문서](https://clickhouse.com/docs)
