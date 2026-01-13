# ClickHouse 쿼리 예시

## HTTP 요청 현황

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

## HTTP 에러율

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

## 데이터베이스별 작업 현황

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

## 데이터베이스 평균 지연 시간

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

## Event Loop 상태

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

## Event Loop Utilization

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