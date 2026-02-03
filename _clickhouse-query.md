# ClickHouse 쿼리 예시

docker compose -f docker-compose.monitoring.yml exec clickstack clickhouse-client

## Useful Queries

### Check trace/log data (typical HyperDX table)

```sql
SELECT * FROM otel_traces LIMIT 10;
SELECT * FROM otel_logs LIMIT 10;
```

### See table sizes

```sql 
SELECT database, table, formatReadableSize(sum(bytes)) as size
FROM system.parts
GROUP BY database, table
ORDER BY sum(bytes) DESC;
```

## metrics_sum

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

## metrics-histogram

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

## metrics-gauge

```sql
-- Event Loop 상태, 시간별 P99 이벤트 루프 지연
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) * 1000 as delay_ms
FROM otel_metrics_gauge
WHERE MetricName = 'nodejs.eventloop.delay.p99'
GROUP BY time
ORDER BY time;

-- 이벤트 루프 사용률 추이
SELECT
  toStartOfMinute(TimeUnix) as time,
  avg(Value) * 100 as utilization_pct
FROM otel_metrics_gauge
WHERE MetricName = 'nodejs.eventloop.utilization'
GROUP BY time
ORDER BY time;
```

## The Way to Check TTL

```sql
ALTER TABLE default.otel_traces MODIFY TTL toDateTime(Timestamp) + INTERVAL 7 DAY;
ALTER TABLE default.otel_logs MODIFY TTL toDateTime(Timestamp) + INTERVAL 15 DAY;
ALTER TABLE default.otel_metrics_sum MODIFY TTL toDateTime(TimeUnix) + INTERVAL 30 DAY;
ALTER TABLE system.trace_log MODIFY TTL event_time + INTERVAL 1 DAY;
ALTER TABLE system.metric_log MODIFY TTL event_time + INTERVAL 1 DAY;
ALTER TABLE system.query_log MODIFY TTL event_time + INTERVAL 1 DAY;

-- 모든 테이블의 TTL 설정 확인
SELECT
    database,
    table,
    engine,
    partition_key,
    sorting_key
FROM system.tables
WHERE database NOT IN ('INFORMATION_SCHEMA', 'information_schema');

-- TTL이 설정된 테이블만 필터링
SELECT
    database,
    name AS table,
    engine_full
FROM system.tables
WHERE database NOT IN ('INFORMATION_SCHEMA', 'information_schema') AND engine_full LIKE '%TTL%';

-- TTL 관련 시스템 설정 확인
SELECT name, value
FROM system.settings
WHERE name LIKE '%ttl%' OR name LIKE '%merge%';

-- TTL 정리 강제 실행 (주의해서 사용)
OPTIMIZE TABLE <database>.<table_name> FINAL;
```

> **Note**: ClickHouse TTL은 백그라운드 머지 중에 적용됩니다. 만료된 데이터가 즉시 삭제되지 않을 수 있습니다.

### Recommended Retention by Signal

| Signal | TTL | Reason |
|--------|-----|--------|
| **Traces** | 7-14 days | 고용량, 최근 이슈 디버깅용 |
| **Logs (debug)** | 3-7 days | 매우 고용량, 장기 보관 불필요 |
| **Logs (error)** | 30-90 days | 인시던트 분석에 중요 |
| **Metrics** | 90-365 days | 저용량, 트렌드 분석에 가치 있음 |

## server settings

```sql
SELECT name, value, default, changed, description
FROM system.server_settings
WHERE name LIKE '%background%' OR name LIKE '%pool%'
ORDER BY name;
```

┌───────────────────────────────┬─────────┬──────────────────────────────────────────┐
│            Setting            │ Default │               Description                │
├───────────────────────────────┼─────────┼──────────────────────────────────────────┤
│ background_pool_size          │ 16      │ Threads for background merges            │
├───────────────────────────────┼─────────┼──────────────────────────────────────────┤
│ background_schedule_pool_size │ 128     │ Threads for scheduled tasks              │
├───────────────────────────────┼─────────┼──────────────────────────────────────────┤
│ background_fetches_pool_size  │ 8       │ Threads for fetching parts (replication) │
├───────────────────────────────┼─────────┼──────────────────────────────────────────┤
│ background_move_pool_size     │ 8       │ Threads for moving parts between disks   │
├───────────────────────────────┼─────────┼──────────────────────────────────────────┤
│ background_common_pool_size   │ 8       │ Common pool for misc operations          │
└───────────────────────────────┴─────────┴──────────────────────────────────────────┘

## merge tree settings

```sql
SELECT name, value, description
FROM system.merge_tree_settings
WHERE name LIKE '%background%' OR name LIKE '%merge%'
LIMIT 20;
```

## Merges thread trobleshooting

```sql
SELECT count() as active_merges FROM system.merges;

SELECT
      database,
      table,
      elapsed,                    -- 이 merge가 시작된 후 경과 시간 (초)
      progress,                   -- 진행률 (0.0 ~ 1.0)
      num_parts,                  -- 합치고 있는 part 개수
      formatReadableSize(total_size_bytes_compressed) as size,
      rows_read,
      rows_written
FROM system.merges
ORDER BY elapsed DESC;

-- merge background thread 성공/실패 개수 파악
SELECT metric, value
FROM system.metrics
WHERE metric IN ('MergeParts','MergeTreeBackgroundExecutorThreadsActive', 'TotalMergeFailures', 'NonAbortedMergeFailures')

-- 요일별 파티션 사용량
SELECT partition, count() as parts, formatReadableSize(sum(bytes_on_disk)) as size, sum(rows) as total_rows
FROM system.parts
WHERE active AND database='default' AND table='otel_traces'
GROUP BY partition
ORDER BY partition
```


/var/log/clickhouse-server/clickhouse-server.err.log