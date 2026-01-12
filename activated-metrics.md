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

## 3. HTTP Metrics (Auto-Instrumentation)

From `@opentelemetry/instrumentation-http` (included in auto-instrumentations-node)

> Note: HTTP metrics require explicit opt-in. Currently using default config which primarily provides traces.

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
