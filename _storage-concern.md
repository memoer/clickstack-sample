# ClickHouse Storage Concern

서버가 모든 텔레메트리 데이터(로그, 메트릭, 트레이스)를 OTLP Collector로 전송할 때 ClickHouse 스토리지에 미치는 영향 분석입니다.

---

## Storage Impact Overview

OTEL SDK의 성능 영향은 최소화되어 있지만, **ClickHouse 스토리지는 제한 없이 수집하면 빠르게 증가**할 수 있습니다.

---

## Data Size Estimation

### Per Record Size

| Signal | Raw Size | Compression Ratio | Compressed Size |
|--------|----------|-------------------|-----------------|
| **Trace (Span)** | 1-5 KB | ~10:1 | 100-500 bytes |
| **Log** | 200-500 bytes | ~5:1 | 40-100 bytes |
| **Metric** | 100-200 bytes | ~10:1 | 10-20 bytes |

> ClickHouse는 컬럼 기반 저장소로 압축률이 매우 높습니다 (10:1 이상).

---

## Storage Growth Calculation

### Example Scenario

```
조건: 100 RPS, 요청당 5개 span, 요청당 3개 로그

초당 데이터:
├─ Traces: 100 req × 5 spans × 300 bytes = 150 KB
├─ Logs:   100 req × 3 logs × 70 bytes  = 21 KB
├─ Metrics: aggregated (minimal)        = ~1 KB
└─ Total: ~172 KB/sec

일간 데이터:
├─ 172 KB × 86,400 sec = ~14.4 GB/day (compressed)

월간 데이터:
└─ ~432 GB/month
```

### Storage by Traffic Level

| Traffic | Daily | Monthly | Yearly |
|---------|-------|---------|--------|
| **10 RPS** | ~1.5 GB | ~45 GB | ~540 GB |
| **100 RPS** | ~15 GB | ~450 GB | ~5.4 TB |
| **1000 RPS** | ~150 GB | ~4.5 TB | ~54 TB |

---

## Storage by Signal Type

각 신호 유형별 스토리지 비중:

```
┌────────────────────────────────────────────────────────────┐
│                    Storage Distribution                     │
├────────────────────────────────────────────────────────────┤
│  Traces  ████████████████████████████████████████  70-80%  │
│  Logs    ████████████████                          15-25%  │
│  Metrics ████                                       3-5%   │
└────────────────────────────────────────────────────────────┘
```

**Traces가 가장 큰 비중을 차지합니다** - 샘플링이 가장 효과적인 최적화 방법입니다.

---

## Mitigation Strategies

### 1. Retention Policy (TTL)

ClickHouse TTL을 사용하여 오래된 데이터를 자동 삭제합니다:

```sql
-- 현재 테이블 확인
SELECT
    database,
    table,
    engine
FROM system.tables
WHERE database IN ('default', 'otel');

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

---

### 2. Trace Sampling

소스에서 데이터를 줄여 수집합니다:

```typescript
// tracing.ts - 샘플링 추가
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler
} from "@opentelemetry/sdk-trace-node";

const sdk = new NodeSDK({
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(0.1), // 10%만 샘플링
  }),
  // ... rest of config
});
```

#### Sampling Rate Impact

| Sampling Rate | Storage Reduction | Trade-off |
|---------------|-------------------|-----------|
| 100% (default) | None | 완전한 가시성 |
| 50% | 50% 감소 | 일부 에러 누락 가능 |
| 10% | 90% 감소 | 통계적 분석만 가능 |
| 1% | 99% 감소 | 하이레벨 트렌드만 |

---

### 3. Log Level Filtering

프로덕션에서 로그 레벨을 필터링하여 볼륨을 줄입니다:

```typescript
// logger.ts
import pino from 'pino';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
});

export default logger;
```

#### Log Volume by Level

| Level | Typical Volume | Storage Impact |
|-------|----------------|----------------|
| `debug` | 매우 높음 | 전체의 60-70% |
| `info` | 높음 | 전체의 20-30% |
| `warn` | 보통 | 전체의 5-10% |
| `error` | 낮음 | 전체의 1-5% |

> **Tip**: 프로덕션에서 `warn` 이상만 수집하면 로그 스토리지를 70-80% 줄일 수 있습니다.

---

### 4. Attribute Limiting

큰 속성은 스토리지를 크게 증가시킵니다:

```typescript
// tracing.ts - 속성 크기 제한
"@opentelemetry/instrumentation-http": {
  // request/response body 캡처 비활성화
  requestHook: (span, request) => {
    // 필수 속성만 설정
    span.setAttribute('http.route', request.route);
    // 큰 body는 저장하지 않음
  },
},

"@opentelemetry/instrumentation-mongodb": {
  // 전체 쿼리 대신 요약만 저장
  enhancedDatabaseReporting: false,
},
```

---

### 5. Metric Cardinality Control

메트릭 카디널리티(고유 레이블 조합 수)를 제한합니다:

```typescript
// Bad: 무한 카디널리티
meter.createCounter('http.requests', {
  attributes: { userId: user.id }  // 사용자마다 새 시리즈 생성
});

// Good: 제한된 카디널리티
meter.createCounter('http.requests', {
  attributes: {
    method: 'GET',      // 제한된 값 (GET, POST, PUT, DELETE)
    status: '2xx',      // 그룹화된 상태 코드
    endpoint: '/users'  // 제한된 엔드포인트
  }
});
```

---

## Storage Monitoring Queries

### Current Storage Usage

```sql
-- 테이블별 스토리지 사용량
SELECT
    table,
    formatReadableSize(sum(bytes_on_disk)) as size,
    formatReadableQuantity(sum(rows)) as rows,
    min(min_time) as oldest_data,
    max(max_time) as newest_data
FROM system.parts
WHERE active AND database = 'default'
GROUP BY table
ORDER BY sum(bytes_on_disk) DESC;
```

### Daily Growth Rate

```sql
-- 일별 데이터 증가량
SELECT
    toDate(max_time) as date,
    table,
    formatReadableSize(sum(bytes_on_disk)) as daily_size,
    sum(rows) as daily_rows
FROM system.parts
WHERE active
GROUP BY date, table
ORDER BY date DESC, daily_size DESC
LIMIT 20;
```

### Partition Info

```sql
-- 파티션 정보 (삭제 대상 확인)
SELECT
    table,
    partition,
    formatReadableSize(sum(bytes_on_disk)) as size,
    min(min_time) as min_time,
    max(max_time) as max_time
FROM system.parts
WHERE active
GROUP BY table, partition
ORDER BY min_time;
```

---

## Environment-Based Strategy

| Environment | Traces | Logs | Metrics | Expected Storage |
|-------------|--------|------|---------|------------------|
| **Development** | 100%, 3일 | All, 7일 | All, 30일 | < 10 GB |
| **Staging** | 100%, 7일 | Warn+, 14일 | All, 90일 | 10-50 GB |
| **Production** | 10-50%, 14일 | Error+, 30일 | All, 365일 | 50-500 GB |

---

## Storage Optimization Checklist

```
┌─────────────────────────────────────────────────────────────┐
│                   Storage Optimization                       │
├─────────────────────────────────────────────────────────────┤
│  □ 각 테이블에 TTL 설정 (traces: 7d, logs: 30d)             │
│  □ 고트래픽 시 trace 샘플링 활성화 (10-50%)                  │
│  □ 프로덕션에서 debug 로그 필터링                            │
│  □ span 속성 개수와 크기 제한                                │
│  □ 메트릭 카디널리티 제한 (bounded labels)                   │
│  □ 주간 스토리지 증가량 모니터링                             │
│  □ 디스크 사용량 알림 설정                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Cost Estimation

클라우드 환경에서의 스토리지 비용 추정:

| Storage | AWS EBS (gp3) | GCP PD | Self-Hosted |
|---------|---------------|--------|-------------|
| 100 GB | ~$8/month | ~$4/month | 디스크 비용 |
| 500 GB | ~$40/month | ~$20/month | 디스크 비용 |
| 1 TB | ~$80/month | ~$40/month | 디스크 비용 |

> **Note**: 네트워크 전송 비용(ingress/egress)은 별도입니다.

---

## Key Takeaways

1. **Traces가 스토리지의 70-80%** 차지 → 샘플링이 가장 효과적
2. **TTL 설정 필수** → 오래된 데이터 자동 삭제
3. **프로덕션에서 debug 로그 비활성화** → 로그 볼륨 70% 감소
4. **메트릭 카디널리티 제어** → 무한 증가 방지
5. **주간 모니터링** → 예상치 못한 증가 조기 발견

---

## References

- [ClickHouse TTL Documentation](https://clickhouse.com/docs/en/guides/developer/ttl)
- [OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/)
- [ClickHouse Storage Optimization](https://clickhouse.com/docs/en/operations/optimizing-performance/)
