# Enabled Metrics

A list of all metrics currently available in the ClickStack OTEL backend.

---

## 1. Custom Business Metrics

Defined in `backend/src/tasks/tasks.metric.ts`

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `tasks.operations.total` | Counter | 1 | Total number of task operations |
| `tasks.operation.duration` | Histogram | ms | Duration of task operations in milliseconds |
| `tasks.active.count` | UpDownCounter | 1 | Current number of active tasks |

### Attributes

| Metric | Attributes |
|--------|------------|
| `tasks.operations.total` | `operation`, `status` |
| `tasks.operation.duration` | `operation` |

---

## 2. Node.js Runtime Metrics

From `@opentelemetry/instrumentation-runtime-node`

### Event Loop Metrics

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `nodejs.eventloop.delay.min` | Gauge | s | Minimum event loop delay |
| `nodejs.eventloop.delay.max` | Gauge | s | Maximum event loop delay |
| `nodejs.eventloop.delay.mean` | Gauge | s | Average event loop delay |
| `nodejs.eventloop.delay.stddev` | Gauge | s | Standard deviation of event loop delay |
| `nodejs.eventloop.delay.p50` | Gauge | s | 50th percentile event loop delay |
| `nodejs.eventloop.delay.p90` | Gauge | s | 90th percentile event loop delay |
| `nodejs.eventloop.delay.p99` | Gauge | s | 99th percentile event loop delay |
| `nodejs.eventloop.utilization` | Gauge | 1 | Event loop utilization (0-1) |

### Handle/Request Metrics

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `nodejs.active_handles.total` | Gauge | 1 | Number of active handles |
| `nodejs.active_requests.total` | Gauge | 1 | Number of active requests |

---

## 3. Custom HTTP Metrics

Defined in `backend/src/metrics/http.metric.ts`

| Metric Name | Type | Unit | Description |
|-------------|------|------|-------------|
| `http.requests.total` | Counter | 1 | Total number of HTTP requests |
| `http.active_users` | Observable Gauge | 1 | Unique active users in the last 5 minutes |

### Attributes

| Metric | Attributes |
|--------|------------|
| `http.requests.total` | `method`, `route`, `status`, `status_code` |
| `http.active_users` | (none) |

### Attribute Values

| Attribute | Values |
|-----------|--------|
| `method` | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `route` | Route pattern (e.g., `/api/tasks/:id`) |
| `status` | `success` (status < 400), `error` (status >= 400) |
| `status_code` | HTTP status code as string (`200`, `404`, `500`, etc.) |

---

## 4. HTTP Metrics (Auto-Instrumentation)

From `@opentelemetry/instrumentation-http` (included in auto-instrumentations-node)

| Metric Name | Type | Unit | Description | Status |
|-------------|------|------|-------------|--------|
| `http.server.request.duration` | Histogram | s | Server request duration | Experimental |
| `http.server.active_requests` | UpDownCounter | 1 | Current in-flight requests | Experimental |
| `http.client.request.duration` | Histogram | s | Client request duration | Experimental |

### Attributes (when enabled)

| Attribute | Description |
|-----------|-------------|
| `http.request.method` | HTTP method (GET, POST, etc.) |
| `http.response.status_code` | Response status code |
| `url.scheme` | http or https |
| `server.address` | Server hostname |
| `server.port` | Server port |

---

## Configuration Reference

### Metric Export Settings

```typescript
// backend/src/tracing.ts
metricReader: new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5_000,  // Export every 5 seconds
}),
```

### Runtime Instrumentation Settings

```typescript
new RuntimeNodeInstrumentation({
  monitoringPrecision: 5_000,  // Collect every 5 seconds
}),
```

---

## Useful Queries (ClickHouse/Grafana)

### Task Operations Rate

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  sum(Value) as operations
FROM otel_metrics_sum
WHERE MetricName = 'tasks.operations.total'
GROUP BY time
ORDER BY time
```

### Event Loop Health

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) * 1000 as delay_ms  -- convert to milliseconds
FROM otel_metrics_gauge
WHERE MetricName = 'nodejs.eventloop.delay.p99'
GROUP BY time
ORDER BY time
```

### Active Tasks Over Time

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) as active_tasks
FROM otel_metrics_sum  -- UpDownCounter uses sum table
WHERE MetricName = 'tasks.active.count'
GROUP BY time
ORDER BY time
```

### HTTP Requests by Endpoint

```sql
SELECT
  Attributes['route'] as endpoint,
  Attributes['method'] as method,
  sum(Value) as total_requests
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY endpoint, method
ORDER BY total_requests DESC
```

### HTTP Success/Error Rate

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  Attributes['status'] as status,
  sum(Value) as count
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY time, status
ORDER BY time
```

### HTTP Error Rate Percentage

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  100.0 * sumIf(Value, Attributes['status'] = 'error') / sum(Value) as error_rate
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY time
ORDER BY time
```

### Active Users Over Time

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) as active_users
FROM otel_metrics_gauge
WHERE MetricName = 'http.active_users'
GROUP BY time
ORDER BY time
```

---

## Adding New Metrics

```typescript
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("your-service", "1.0.0");

// Counter
const counter = meter.createCounter("your.counter.name", {
  description: "Description here",
  unit: "1",
});

// Histogram
const histogram = meter.createHistogram("your.histogram.name", {
  description: "Description here",
  unit: "ms",
});

// UpDownCounter
const upDownCounter = meter.createUpDownCounter("your.updowncounter.name", {
  description: "Description here",
  unit: "1",
});

// Observable Gauge
meter.createObservableGauge("your.gauge.name", {
  description: "Description here",
  unit: "bytes",
}, (observableResult) => {
  observableResult.observe(getCurrentValue());
});
```
