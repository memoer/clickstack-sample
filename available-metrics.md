# Available Metrics

Quick reference for all metrics in ClickStack OTEL backend.

---

## Custom Metrics

### Database Tasks (`database-tasks-service`)

| Metric | Type | Description | Attributes |
|--------|------|-------------|------------|
| `db_tasks.operations.total` | Counter | Total number of database task operations | `database`, `operation`, `status` |
| `db_tasks.operation.duration` | Histogram (ms) | Duration of database task operations | `database`, `operation` |

### HTTP (`http-service`)

| Metric | Type | Description | Attributes |
|--------|------|-------------|------------|
| `http.requests.total` | Counter | Total number of HTTP requests | `method`, `route`, `status`, `status_code` |

---

## Auto-Instrumented Metrics

### Node.js Runtime

| Metric | Type | Description |
|--------|------|-------------|
| `nodejs.eventloop.delay.min` | Gauge (s) | Minimum event loop delay |
| `nodejs.eventloop.delay.max` | Gauge (s) | Maximum event loop delay |
| `nodejs.eventloop.delay.mean` | Gauge (s) | Average event loop delay |
| `nodejs.eventloop.delay.stddev` | Gauge (s) | Standard deviation of event loop delay |
| `nodejs.eventloop.delay.p50` | Gauge (s) | 50th percentile event loop delay |
| `nodejs.eventloop.delay.p90` | Gauge (s) | 90th percentile event loop delay |
| `nodejs.eventloop.delay.p99` | Gauge (s) | 99th percentile event loop delay |
| `nodejs.eventloop.utilization` | Gauge (0-1) | Event loop utilization ratio |
| `nodejs.active_handles.total` | Gauge | Number of active libuv handles |
| `nodejs.active_requests.total` | Gauge | Number of active libuv requests |

### HTTP (Experimental)

| Metric | Type | Description | Attributes |
|--------|------|-------------|------------|
| `http.server.request.duration` | Histogram (s) | Server-side request duration | `http.request.method`, `http.route`, `http.response.status_code` |
| `http.server.active_requests` | UpDownCounter | Current in-flight server requests | `http.request.method` |
| `http.client.request.duration` | Histogram (s) | Client-side request duration | `http.request.method`, `server.address`, `http.response.status_code` |

---

## Attribute Values

| Attribute | Possible Values |
|-----------|-----------------|
| `database` | `mongodb`, `redis`, `postgres` |
| `operation` | `getAll`, `getById`, `create`, `update`, `delete` |
| `status` | `success`, `error`, `not_found` |
| `method` | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |

---

## Export Settings

- **Interval**: 5 seconds
- **Protocol**: OTLP over HTTP
- **Endpoint**: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`

---

## Useful Queries (ClickHouse)

### Database Operations by Type

```sql
SELECT
  Attributes['database'] as database,
  Attributes['operation'] as operation,
  sum(Value) as count
FROM otel_metrics_sum
WHERE MetricName = 'db_tasks.operations.total'
GROUP BY database, operation
ORDER BY count DESC
```

### Average Duration per Database

```sql
SELECT
  Attributes['database'] as database,
  avg(Sum / Count) as avg_duration_ms
FROM otel_metrics_histogram
WHERE MetricName = 'db_tasks.operation.duration'
GROUP BY database
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

### HTTP Latency by Endpoint

```sql
SELECT
  Attributes['http.route'] as endpoint,
  Attributes['http.request.method'] as method,
  avg(Sum / Count) * 1000 as avg_latency_ms,
  count() as sample_count
FROM otel_metrics_histogram
WHERE MetricName = 'http.server.request.duration'
GROUP BY endpoint, method
ORDER BY avg_latency_ms DESC
```

### HTTP Total Summary

```sql
SELECT
  sum(Value) as total_requests,
  sumIf(Value, Attributes['status'] = 'error') as total_errors,
  100.0 * sumIf(Value, Attributes['status'] = 'error') / sum(Value) as error_rate
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
```

### HTTP Error Rate by Endpoint

```sql
SELECT
  Attributes['route'] as endpoint,
  Attributes['method'] as method,
  sum(Value) as total_requests,
  sumIf(Value, Attributes['status'] = 'error') as error_count,
  100.0 * sumIf(Value, Attributes['status'] = 'error') / sum(Value) as error_rate
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY endpoint, method
ORDER BY error_rate DESC
```

### Event Loop Health (p99)

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) * 1000 as delay_ms
FROM otel_metrics_gauge
WHERE MetricName = 'nodejs.eventloop.delay.p99'
GROUP BY time
ORDER BY time
```
