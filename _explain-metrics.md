# ClickStack Metrics 설명서

이 문서는 프로젝트에서 수집하는 모든 메트릭을 설명합니다.

## 목차

1. [메트릭 개요](#메트릭-개요)
2. [커스텀 메트릭](#커스텀-메트릭)
   - [HTTP 요청 메트릭](#http-요청-메트릭)
   - [데이터베이스 메트릭](#데이터베이스-메트릭)
3. [Auto-Instrumented 메트릭](#auto-instrumented-메트릭)
   - [Node.js Runtime 메트릭](#nodejs-runtime-메트릭)
   - [HTTP Semantic Convention 메트릭](#http-semantic-convention-메트릭)
4. [메트릭 타입 설명](#메트릭-타입-설명)
5. [ClickHouse 쿼리 예시](#clickhouse-쿼리-예시)

---

## 메트릭 개요

프로젝트에서 수집되는 메트릭은 두 가지 카테고리로 나뉩니다:

| 카테고리 | 소스 | 메트릭 예시 |
|---------|------|------------|
| **커스텀 메트릭** | 애플리케이션 코드에서 직접 생성 | `http.requests.total`, `db_tasks.operations.total` |
| **Auto-Instrumented** | OpenTelemetry 라이브러리가 자동 생성 | `nodejs.eventloop.*`, `http.server.request.duration` |

### 메트릭 수집 플로우

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Backend (NestJS)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────┐ │
│  │ Custom Metrics          │    │ Auto-Instrumented Metrics           │ │
│  │                         │    │                                      │ │
│  │ • http.requests.total   │    │ • nodejs.eventloop.delay.*          │ │
│  │ • db_tasks.operations.* │    │ • nodejs.eventloop.utilization      │ │
│  │ • db_tasks.operation.   │    │ • nodejs.active_handles.total       │ │
│  │   duration              │    │ • nodejs.active_requests.total      │ │
│  │                         │    │ • http.server.request.duration      │ │
│  └───────────┬─────────────┘    └───────────────┬─────────────────────┘ │
│              │                                   │                       │
│              └───────────────┬───────────────────┘                       │
│                              │                                           │
│                              ▼                                           │
│              ┌───────────────────────────────────────┐                   │
│              │ PeriodicExportingMetricReader         │                   │
│              │ (5초마다 내보냄)                       │                   │
│              └───────────────────────────────────────┘                   │
│                              │                                           │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │ OTLP gRPC (4317)
                               ▼
               ┌───────────────────────────────────────┐
               │        OTEL Collector                  │
               │  (tail-based sampling은 trace만)       │
               │  (metrics는 100% 전달)                 │
               └───────────────────────────────────────┘
                               │
                               ▼
               ┌───────────────────────────────────────┐
               │      ClickHouse (otel_metrics_*)       │
               │  • otel_metrics_sum (Counter)          │
               │  • otel_metrics_histogram (Histogram)  │
               │  • otel_metrics_gauge (Gauge)          │
               └───────────────────────────────────────┘
```

---

## 커스텀 메트릭

### HTTP 요청 메트릭

**파일 위치**: `backend/src/shared/metrics/tracing.interceptor.metric.ts`

#### `http.requests.total` (Counter)

| 속성 | 값 |
|------|---|
| **Meter** | `http-service` v1.0.0 |
| **Type** | Counter |
| **Unit** | `1` |
| **Description** | Total number of HTTP requests |

**Attributes**:

| Attribute | 설명 | 예시 값 |
|-----------|------|--------|
| `method` | HTTP 메서드 | `GET`, `POST`, `PUT`, `DELETE` |
| `route` | 라우트 패턴 | `/mongo/tasks`, `/redis/tasks/:id` |
| `status` | 성공/에러 | `success`, `error` |
| `status_code` | HTTP 상태 코드 | `200`, `404`, `500` |

**코드 구현**:

```typescript
// shared/metrics/tracing.interceptor.metric.ts
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("http-service", "1.0.0");

export const httpRequestsCounter = meter.createCounter("http.requests.total", {
  description: "Total number of HTTP requests",
  unit: "1",
});

export function addHttpRequestCounter(
  method: string,
  route: string,
  statusCode: number
): void {
  const status = statusCode >= 400 ? "error" : "success";
  httpRequestsCounter.add(1, {
    method,
    route,
    status,
    status_code: statusCode.toString(),
  });
}
```

**사용 위치**: `TracingInterceptor`에서 모든 HTTP 요청 완료 시 호출

---

### 데이터베이스 메트릭

**파일 위치**: `backend/src/shared/metrics/database-tasks.metric.ts`

#### `db_tasks.operations.total` (Counter)

| 속성 | 값 |
|------|---|
| **Meter** | `database-tasks-service` v1.0.0 |
| **Type** | Counter |
| **Unit** | `1` |
| **Description** | Total number of database task operations |

**Attributes**:

| Attribute | 설명 | 예시 값 |
|-----------|------|--------|
| `database` | 데이터베이스 종류 | `mongodb`, `redis`, `postgres` |
| `operation` | CRUD 작업 | `getAll`, `getById`, `create`, `update`, `delete` |
| `status` | 작업 결과 | `success`, `error`, `not_found` |

#### `db_tasks.operation.duration` (Histogram)

| 속성 | 값 |
|------|---|
| **Meter** | `database-tasks-service` v1.0.0 |
| **Type** | Histogram |
| **Unit** | `ms` |
| **Description** | Duration of database task operations in milliseconds |

**Attributes**:

| Attribute | 설명 | 예시 값 |
|-----------|------|--------|
| `database` | 데이터베이스 종류 | `mongodb`, `redis`, `postgres` |
| `operation` | CRUD 작업 | `getAll`, `getById`, `create`, `update`, `delete` |

**코드 구현**:

```typescript
// shared/metrics/database-tasks.metric.ts
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("database-tasks-service", "1.0.0");

export const dbTaskOperationsCounter = meter.createCounter(
  "db_tasks.operations.total",
  {
    description: "Total number of database task operations",
    unit: "1",
  }
);

const dbTaskDurationHistogram = meter.createHistogram(
  "db_tasks.operation.duration",
  {
    description: "Duration of database task operations in milliseconds",
    unit: "ms",
  }
);

export function recordDbMetrics(
  database: "mongodb" | "redis" | "postgres",
  operation: string,
  startTime: number,
  status: "success" | "error" | "not_found" = "success"
): void {
  const duration = Date.now() - startTime;
  dbTaskOperationsCounter.add(1, { database, operation, status });
  dbTaskDurationHistogram.record(duration, { database, operation });
}
```

**사용 위치**: 각 데이터베이스 서비스 (`MongoTasksService`, `RedisTasksService`, `PostgresTasksService`)의 모든 메서드에서 호출

**사용 예시**:

```typescript
// mongo-tasks.service.ts
async create(createTaskDto: CreateTaskDto): Promise<Task> {
  const startTime = Date.now();
  try {
    const task = await this.taskModel.create(createTaskDto);
    recordDbMetrics("mongodb", "create", startTime, "success");
    return task;
  } catch (error) {
    recordDbMetrics("mongodb", "create", startTime, "error");
    throw error;
  }
}
```

---

## Auto-Instrumented 메트릭

### Node.js Runtime 메트릭

**생성 소스**: `@opentelemetry/instrumentation-runtime-node`

#### Event Loop Delay 메트릭

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `nodejs.eventloop.delay.min` | Gauge | seconds | 최소 이벤트 루프 지연 |
| `nodejs.eventloop.delay.max` | Gauge | seconds | 최대 이벤트 루프 지연 |
| `nodejs.eventloop.delay.mean` | Gauge | seconds | 평균 이벤트 루프 지연 |
| `nodejs.eventloop.delay.stddev` | Gauge | seconds | 이벤트 루프 지연 표준편차 |
| `nodejs.eventloop.delay.p50` | Gauge | seconds | 50번째 백분위수 지연 |
| `nodejs.eventloop.delay.p90` | Gauge | seconds | 90번째 백분위수 지연 |
| `nodejs.eventloop.delay.p99` | Gauge | seconds | 99번째 백분위수 지연 |

#### Event Loop Utilization

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `nodejs.eventloop.utilization` | Gauge | ratio (0-1) | 이벤트 루프가 JavaScript를 실행하는 데 소요된 시간 비율 |

#### Active Resources

| Metric | Type | Unit | Description |
|--------|------|------|-------------|
| `nodejs.active_handles.total` | Gauge | count | 활성 libuv 핸들 수 (TCP 소켓, 타이머 등) |
| `nodejs.active_requests.total` | Gauge | count | 활성 libuv 요청 수 (파일 I/O, DNS 조회 등) |

**설정 위치**: `tracing.ts`

```typescript
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";

// SDK 설정 내
instrumentations: [
  // ...
  new RuntimeNodeInstrumentation({
    monitoringPrecision: 5_000, // 5초마다 수집 (메트릭 내보내기 간격과 일치)
  }),
]
```

---

### HTTP Semantic Convention 메트릭

**생성 소스**: `@opentelemetry/instrumentation-http`

#### `http.server.request.duration` (Histogram)

서버로서 받은 요청의 처리 시간을 측정합니다.

```
[External Client] ──request──> [Your Server]
                                    │
                         ┌──────────┴──────────┐
                         │ http.server.request │
                         │    .duration        │
                         │  (처리 시간)         │
                         └──────────┬──────────┘
                                    │
[External Client] <──response── [Your Server]
```

**Attributes**:
- `http.request.method` - HTTP 메서드
- `http.route` - 라우트 패턴 (예: `/users/{id}`)
- `http.response.status_code` - 응답 상태 코드
- `url.scheme` - http 또는 https

#### `http.client.request.duration` (Histogram)

클라이언트로서 보낸 요청의 왕복 시간을 측정합니다.

```
[Your App] ──request──> [External Service/API]
    │
    │  ┌────────────────────────┐
    │  │ http.client.request    │
    │  │    .duration           │
    │  │  (왕복 시간)            │
    │  └────────────────────────┘
    │
[Your App] <──response── [External Service/API]
```

**Attributes**:
- `http.request.method` - HTTP 메서드
- `http.response.status_code` - 응답 상태 코드
- `server.address` - 대상 호스트
- `server.port` - 대상 포트

#### Server vs Client Duration 비교

| 측면 | `http.server.request.duration` | `http.client.request.duration` |
|------|--------------------------------|--------------------------------|
| **역할** | 서버로서 | 클라이언트로서 |
| **측정** | 들어오는 요청 처리 시간 | 나가는 요청 왕복 시간 |
| **포함** | 앱 처리 시간 | 네트워크 지연 + 원격 처리 시간 |
| **용도** | API 성능 모니터링 | 의존성 지연 모니터링 |

---

## 메트릭 타입 설명

### Counter (카운터)

증가만 가능한 누적 값입니다.

```typescript
const counter = meter.createCounter("requests.total");
counter.add(1);  // +1
counter.add(5);  // +5
// counter.add(-1);  // 불가능!
```

**용도**: 요청 수, 에러 수, 바이트 전송량

### Histogram (히스토그램)

값의 분포를 측정합니다. 내부적으로 버킷별 카운트와 합계를 저장합니다.

```typescript
const histogram = meter.createHistogram("request.duration");
histogram.record(150);  // 150ms
histogram.record(200);  // 200ms
histogram.record(50);   // 50ms
// 결과: count=3, sum=400, buckets=[...]
```

**용도**: 응답 시간, 요청 크기, 처리 지연

### Gauge (게이지)

현재 값의 스냅샷입니다. 증가하거나 감소할 수 있습니다.

```typescript
// ObservableGauge는 콜백으로 값을 제공
meter.createObservableGauge("cpu.usage", {}, (result) => {
  result.observe(getCurrentCpuUsage());
});
```

**용도**: CPU 사용률, 메모리 사용량, 현재 연결 수

### UpDownCounter (업다운 카운터)

증가와 감소 모두 가능한 카운터입니다.

```typescript
const upDown = meter.createUpDownCounter("active.connections");
upDown.add(1);   // 연결 생성
upDown.add(-1);  // 연결 종료
```

**용도**: 활성 연결 수, 큐 크기, 동시 작업 수

---

## ClickHouse 쿼리 예시

### HTTP 요청 현황

```sql
-- 엔드포인트별 요청 수
SELECT
  Attributes['route'] as endpoint,
  Attributes['method'] as method,
  sum(Value) as total_requests
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY endpoint, method
ORDER BY total_requests DESC;
```

### HTTP 에러율

```sql
-- 엔드포인트별 에러율
SELECT
  Attributes['route'] as endpoint,
  sum(Value) as total_requests,
  sumIf(Value, Attributes['status'] = 'error') as error_count,
  100.0 * sumIf(Value, Attributes['status'] = 'error') / sum(Value) as error_rate
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY endpoint
ORDER BY error_rate DESC;
```

### 데이터베이스별 작업 현황

```sql
-- 데이터베이스별 작업 수
SELECT
  Attributes['database'] as database,
  Attributes['operation'] as operation,
  sum(Value) as count
FROM otel_metrics_sum
WHERE MetricName = 'db_tasks.operations.total'
GROUP BY database, operation
ORDER BY count DESC;
```

### 데이터베이스 평균 지연 시간

```sql
-- 데이터베이스별 평균 작업 시간
SELECT
  Attributes['database'] as database,
  Attributes['operation'] as operation,
  avg(Sum / Count) as avg_duration_ms,
  count() as sample_count
FROM otel_metrics_histogram
WHERE MetricName = 'db_tasks.operation.duration'
GROUP BY database, operation
ORDER BY avg_duration_ms DESC;
```

### Event Loop 상태

```sql
-- 시간별 P99 이벤트 루프 지연
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) * 1000 as delay_ms
FROM otel_metrics_gauge
WHERE MetricName = 'nodejs.eventloop.delay.p99'
GROUP BY time
ORDER BY time;
```

### Event Loop Utilization

```sql
-- 이벤트 루프 사용률 추이
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) * 100 as utilization_pct
FROM otel_metrics_gauge
WHERE MetricName = 'nodejs.eventloop.utilization'
GROUP BY time
ORDER BY time;
```

---

## 메트릭 설정 요약

### 현재 프로젝트 설정

| 설정 | 값 |
|------|---|
| **내보내기 간격** | 5초 (`exportIntervalMillis: 5_000`) |
| **프로토콜** | OTLP over gRPC |
| **포트** | 4317 |
| **엔드포인트** | `OTEL_EXPORTER_OTLP_ENDPOINT` 환경변수 |

### 메트릭 전체 목록

| 메트릭 이름 | 타입 | 소스 | 설명 |
|------------|------|------|------|
| `http.requests.total` | Counter | Custom | HTTP 요청 총 수 |
| `db_tasks.operations.total` | Counter | Custom | DB 작업 총 수 |
| `db_tasks.operation.duration` | Histogram | Custom | DB 작업 소요 시간 |
| `http.server.request.duration` | Histogram | Auto | 서버 요청 처리 시간 |
| `http.client.request.duration` | Histogram | Auto | 클라이언트 요청 왕복 시간 |
| `nodejs.eventloop.delay.*` | Gauge | Auto | 이벤트 루프 지연 (7개 변형) |
| `nodejs.eventloop.utilization` | Gauge | Auto | 이벤트 루프 사용률 |
| `nodejs.active_handles.total` | Gauge | Auto | 활성 libuv 핸들 수 |
| `nodejs.active_requests.total` | Gauge | Auto | 활성 libuv 요청 수 |

---

## 참고 자료

- [OpenTelemetry Metrics Specification](https://opentelemetry.io/docs/specs/otel/metrics/)
- [OpenTelemetry HTTP Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/http/)
- [Node.js Runtime Instrumentation](https://www.npmjs.com/package/@opentelemetry/instrumentation-runtime-node)
