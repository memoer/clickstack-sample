# Available Metrics

Quick reference for all metrics in ClickStack OTEL backend.

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
| `http.server.active_requests` | UpDownCounter | Current in-flight server requests | `http.request.method` |
| `http.server.request.duration` | Histogram (s) | Server-side request duration | `http.request.method`, `http.route`, `http.response.status_code` |
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

---

## Node.js Runtime Metrics Deep Dive

### Understanding libuv

**libuv**는 Node.js의 이벤트 기반, 논블로킹 I/O 모델을 지원하는 C 라이브러리입니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Node.js Process                          │
├─────────────────────────────────────────────────────────────────┤
│   JavaScript Code (V8)                                          │
│        ↓                                                        │
│   Node.js APIs (fs, net, http, dns, etc.)                      │
│        ↓                                                        │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                      libuv                               │  │
│   │  ┌─────────────┐    ┌─────────────────────────────────┐ │  │
│   │  │ Event Loop  │    │ Thread Pool (default: 4)        │ │  │
│   │  │             │    │  - File I/O                     │ │  │
│   │  │  Handles    │    │  - DNS lookups                  │ │  │
│   │  │  Requests   │    │  - Compression                  │ │  │
│   │  └─────────────┘    └─────────────────────────────────┘ │  │
│   └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

libuv는 두 가지 핵심 추상화를 제공합니다:
- **Handles**: 오래 지속되는 리소스 객체 (TCP 소켓, 타이머, 파일 워처)
- **Requests**: 일회성 비동기 작업 객체 (DNS 조회, 파일 읽기/쓰기)

---

### `nodejs.active_handles.total`

활성 libuv 핸들의 수를 측정합니다. 여러 이벤트 루프 반복에 걸쳐 지속되는 장기 객체입니다.

#### Handle Types

| Handle Type | Example Use Case | Created By |
|-------------|------------------|------------|
| `uv_tcp_t` | HTTP 서버 연결 | `net.createServer()` |
| `uv_timer_t` | 예약된 콜백 | `setTimeout()`, `setInterval()` |
| `uv_fs_event_t` | 파일 변경 감시 | `fs.watch()` |
| `uv_signal_t` | 시그널 핸들러 | `process.on('SIGINT')` |

#### Interpretation

| 상태 | 값 범위 | 설명 |
|------|---------|------|
| 정상 | 10-100 | 소규모 앱 |
| 정상 | 100-500 | 연결이 있는 중규모 앱 |
| 경고 | 지속적 증가 | 메모리 누수 의심 |
| 경고 | 급격한 스파이크 | 연결 폭주 또는 리소스 고갈 |

#### Code Example

```javascript
// 각각 핸들을 생성
const server = net.createServer();        // +1 handle (uv_tcp_t)
const timer = setInterval(() => {}, 1000); // +1 handle (uv_timer_t)
const watcher = fs.watch('/tmp');          // +1 handle (uv_fs_event_t)

// 명시적으로 닫을 때까지 핸들은 지속됨
clearInterval(timer);  // -1 handle
watcher.close();       // -1 handle
server.close();        // -1 handle
```

---

### `nodejs.active_requests.total`

현재 진행 중인 활성 libuv 요청의 수를 측정합니다. 단기적이고 일회성인 비동기 작업입니다.

#### Request Types

| Request Type | Operation | Typical Duration |
|--------------|-----------|------------------|
| `uv_fs_t` | 파일 읽기/쓰기 | 1-100ms |
| `uv_getaddrinfo_t` | DNS 해석 | 10-500ms |
| `uv_work_t` | 스레드 풀 작업 | varies |
| `uv_connect_t` | TCP 연결 | 10-1000ms |
| `uv_write_t` | 소켓 쓰기 | 1-50ms |

#### Interpretation

| 상태 | 값 범위 | 설명 |
|------|---------|------|
| 정상 | 0-50 | 가벼운 부하 |
| 정상 | 50-200 | 중간 부하 |
| 경고 | 지속적으로 높음 | I/O 병목 |
| 경고 | 0으로 떨어지지 않음 | 멈춘 작업 가능성 |

#### Code Example

```javascript
// 각 비동기 작업은 요청을 생성 (일시적)
fs.readFile('/data.json', callback);     // +1 request → 완료 → -1
dns.lookup('google.com', callback);       // +1 request → 완료 → -1

// 여러 동시 작업
Promise.all([
  fs.promises.readFile('a.txt'),  // +1 request
  fs.promises.readFile('b.txt'),  // +1 request
  fs.promises.readFile('c.txt'),  // +1 request
]);
// 실행 중 active_requests = 3, 모두 완료 시 0
```

#### Handles vs Requests 비교

| 측면 | Handles | Requests |
|------|---------|----------|
| 수명 | 장기 (분/시간) | 단기 (ms ~ 초) |
| 목적 | 영구 리소스 | 일회성 작업 |
| 이벤트 루프 | 루프를 활성 상태로 유지 | 단독으로 유지하지 않음 |
| 메모리 누수 위험 | 높음 (닫지 않으면) | 낮음 (자동 정리) |

---

### Event Loop Delay Metrics

이벤트 루프는 Node.js의 핵심 실행 메커니즘입니다. **Delay**는 콜백이 큐에서 실행되기까지 대기하는 시간을 측정합니다.

```
Time →
│
│  ┌──────────────────┐     ┌──────────────────┐
│  │ Callback Queued  │     │ Callback Executed │
│  └────────┬─────────┘     └────────┬─────────┘
│           │                        │
│           │←──── Event Loop ──────→│
│           │       Delay            │
└───────────┴────────────────────────┴──────────────→
```

#### `nodejs.eventloop.delay.min`

측정 기간 동안 가장 빠른 콜백 실행 시간입니다.

- **이상적인 값**: < 1ms
- **용도**: 비교를 위한 베이스라인

#### `nodejs.eventloop.delay.max`

측정 기간 동안 가장 느린 콜백 실행 시간입니다.

- **경고 임계값**: > 100ms
- **높은 max의 일반적인 원인**:
  - 동기식 CPU 집약적 코드
  - 대용량 JSON 파싱
  - 가비지 컬렉션 일시 정지

#### `nodejs.eventloop.delay.mean`

모든 콜백의 평균 지연 시간입니다.

- **이상적인 값**: < 10ms
- **한계**: 이상치를 숨길 수 있음 (백분위수 사용 권장)

#### `nodejs.eventloop.delay.stddev`

평균으로부터 지연 시간이 얼마나 변동하는지를 나타냅니다.

| StdDev | 의미 |
|--------|------|
| 낮음 (< 5ms) | 일관되고 예측 가능한 성능 |
| 높음 (> 20ms) | 예측 불가능하고 "불안정한" 경험 |

```
예시:
  App A: mean=10ms, stddev=2ms  → 예측 가능 (좋음)
  App B: mean=10ms, stddev=50ms → 예측 불가능 (나쁨)
```

#### Percentiles (P50, P90, P99)

| Metric | 의미 | 목표 |
|--------|------|------|
| **P50** | 50%의 콜백이 이 시간 내에 완료 | < 5ms |
| **P90** | 90%의 콜백이 이 시간 내에 완료 | < 20ms |
| **P99** | 99%의 콜백이 이 시간 내에 완료 | < 100ms |

**왜 P99가 Mean보다 중요한가:**

```
시나리오: 1000 requests/second, mean=5ms

정규 분포 가정:
  - 990명의 사용자가 ~5ms 경험 (만족)
  - 10명의 사용자가 >50ms 경험 (불만)

P99는 그 10명을 잡아냅니다. Mean은 그들을 숨깁니다.
```

---

### `nodejs.eventloop.utilization`

이벤트 루프가 JavaScript를 실행하는 데 소요된 시간 대 I/O 대기 시간의 비율입니다.

```
Utilization = Active Time / Total Time

┌────────────────────────────────────────────────────────┐
│ 시간 구간: 1초                                          │
├────────────────────────────────────────────────────────┤
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ Active (JS 실행): 300ms                                │
│ Idle (I/O 대기): 700ms                                 │
│ Utilization = 0.30 (30%)                              │
└────────────────────────────────────────────────────────┘
```

#### Interpretation

| 값 | 상태 | 조치 |
|---|------|------|
| 0.0 - 0.3 | Idle | I/O 바운드 앱에서 정상 |
| 0.3 - 0.6 | Healthy | 양호한 활용도 |
| 0.6 - 0.8 | Busy | 주의 깊게 모니터링 |
| 0.8 - 0.9 | **Warning** | 스케일링 고려 |
| 0.9 - 1.0 | **Critical** | 이벤트 루프 포화 |

**선행 지표로서의 Utilization:**

지연 메트릭(문제가 *이미 발생했음*을 알려줌)과 달리, utilization은 지연이 급증하기 *전에* 경고합니다:

```
타임라인:
  T+0:   Utilization이 0.85로 급증 ← 조기 경고
  T+30s: P99 지연이 상승 시작
  T+60s: 사용자들이 느림에 대해 불만

T+0에서 조치하면 연쇄 반응을 방지할 수 있습니다.
```

---

### Summary Cheat Sheet

| Metric | 주시할 점 | Red Flag |
|--------|----------|----------|
| `active_handles.total` | 안정 상태 | 지속적 증가 |
| `active_requests.total` | 부하 시 스파이크 | 0으로 떨어지지 않음 |
| `eventloop.delay.p99` | 테일 레이턴시 | > 100ms 지속 |
| `eventloop.utilization` | CPU 포화 | > 0.8 지속 |
| `eventloop.delay.stddev` | 일관성 | 높은 분산 |
