# ClickStack 데이터 플로우 설명서

이 문서는 **Logs, Metrics, Traces, Session Replay** 데이터가 어떻게 ClickStack을 통해 ClickHouse에 저장되는지 설명합니다.

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

### OTLP gRPC vs HTTP 비교

| 특성 | OTLP gRPC (4317) | OTLP HTTP (4318) |
|------|------------------|------------------|
| 프로토콜 | HTTP/2 + Protobuf | HTTP/1.1 + JSON/Protobuf |
| 성능 | 더 빠름 | 상대적으로 느림 |
| 연결 | Persistent | Request per connection |
| 브라우저 지원 | ❌ | ✅ |
| 디버깅 | 어려움 | 쉬움 (JSON) |
| 방화벽 | 일부 환경에서 차단 | 대부분 통과 |

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
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'my-backend',
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
  }),
  // ... metrics, logs exporters
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

## 참고 자료

- [ClickStack 공식 문서](https://clickhouse.com/docs/use-cases/observability/clickstack/overview)
- [OpenTelemetry 스펙](https://opentelemetry.io/docs/specs/otel/)
- [HyperDX GitHub](https://github.com/hyperdxio/hyperdx)
- [ClickHouse 문서](https://clickhouse.com/docs)
