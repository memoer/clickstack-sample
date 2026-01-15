# ClickHouse 쿼리 예시

docker compose -f docker-compose.monitoring.yml exec clickstack clickhouse-client

## Useful Queries

### See all databases (HyperDX creates these)

```sql
SHOW DATABASES;
```

### See tables in a database

```sql  
SHOW TABLES FROM <database_name>;
```

### Check trace data (typical HyperDX table)

```sql
SELECT * FROM otel_traces LIMIT 10;
```

### Check logs

```sql
SELECT * FROM otel_logs LIMIT 10;
```

### See table sizes

```sql 
SELECT database, table, formatReadableSize(sum(bytes)) as size
FROM system.parts
GROUP BY database, table
ORDER BY sum(bytes) DESC;
```

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

### Retention Policy (TTL)

ClickHouse TTL을 사용하여 오래된 데이터를 자동 삭제합니다:

```sql
-- 현재 테이블 확인
SELECT database, table, engine FROM system.tables WHERE database IN ('default', 'otel');

-- Traces: 7일 보관
ALTER TABLE otel_traces MODIFY TTL toDateTime(Timestamp) + INTERVAL 7 DAY;

-- Logs: 30일 보관
ALTER TABLE otel_logs MODIFY TTL toDateTime(Timestamp) + INTERVAL 30 DAY;

-- Metrics: 90일 보관
ALTER TABLE otel_metrics_sum MODIFY TTL toDateTime(TimeUnix) + INTERVAL 30 DAY;
```

### Recommended Retention by Signal

| Signal | TTL | Reason |
|--------|-----|--------|
| **Traces** | 7-14 days | 고용량, 최근 이슈 디버깅용 |
| **Logs (debug)** | 3-7 days | 매우 고용량, 장기 보관 불필요 |
| **Logs (error)** | 30-90 days | 인시던트 분석에 중요 |
| **Metrics** | 90-365 days | 저용량, 트렌드 분석에 가치 있음 |

### The Way to Check TTL

```sql
-- 모든 테이블의 TTL 설정 확인
SELECT
    database,
    table,
    engine,
    partition_key,
    sorting_key
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema');
```

```sql
-- TTL이 설정된 테이블만 필터링
SELECT
    database,
    name AS table,
    engine_full
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
  AND engine_full LIKE '%TTL%';
```

```sql
-- 특정 테이블의 전체 스키마 확인 (TTL 포함)
SHOW CREATE TABLE <database>.<table_name>;
```

```sql
-- TTL 관련 시스템 설정 확인
SELECT name, value
FROM system.settings
WHERE name LIKE '%ttl%' OR name LIKE '%merge%';
```

```sql
-- TTL 정리 강제 실행 (주의해서 사용)
OPTIMIZE TABLE <database>.<table_name> FINAL;
```

> **Note**: ClickHouse TTL은 백그라운드 머지 중에 적용됩니다. 만료된 데이터가 즉시 삭제되지 않을 수 있습니다.

---