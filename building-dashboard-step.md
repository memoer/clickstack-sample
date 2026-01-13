# Dashboard Build Steps

## Step 1: Node.js Runtime Performance Dashboard

### Date: 2026-01-13

### Objective
Node.js 런타임 영역의 대표적인 성능 지표를 모니터링하기 위한 대시보드 구축

### Created File
`nodejs-runtime-dashboard.json`

### Included Metrics (10 total)

| Metric | Display Name | Unit Conversion |
|--------|--------------|-----------------|
| `nodejs.eventloop.delay.min` | Event Loop Delay Min | × 1000 (s → ms) |
| `nodejs.eventloop.delay.max` | Event Loop Delay Max | × 1000 (s → ms) |
| `nodejs.eventloop.delay.mean` | Event Loop Delay Mean | × 1000 (s → ms) |
| `nodejs.eventloop.delay.stddev` | Event Loop Delay StdDev | × 1000 (s → ms) |
| `nodejs.eventloop.delay.p50` | Event Loop Delay P50 | × 1000 (s → ms) |
| `nodejs.eventloop.delay.p90` | Event Loop Delay P90 | × 1000 (s → ms) |
| `nodejs.eventloop.delay.p99` | Event Loop Delay P99 | × 1000 (s → ms) |
| `nodejs.eventloop.utilization` | Event Loop Utilization | × 100 (ratio → %) |
| `nodejs.active_handles.total` | Active Handles | - |
| `nodejs.active_requests.total` | Active Requests | - |

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Row 0: Event Loop Delay Overview                                           │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────────┤
│  Delay Min      │  Delay Max      │  Delay Mean     │  Delay StdDev           │
│  (w=6)          │  (w=6)          │  (w=6)          │  (w=6)                  │
├─────────────────┴─────────────────┴─────────────────┴─────────────────────────┤
│  Row 1: Percentiles + Utilization                                           │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────────┤
│  Delay P50      │  Delay P90      │  Delay P99      │  Utilization (%)        │
│  (w=6)          │  (w=6)          │  (w=6)          │  (w=6)                  │
├─────────────────┴─────────────────┴─────────────────┴─────────────────────────┤
│  Row 2: Active Resources                                                    │
├─────────────────────────────────────┬─────────────────────────────────────────┤
│  Active Handles (libuv)             │  Active Requests (libuv)              │
│  (w=12)                             │  (w=12)                               │
└─────────────────────────────────────┴─────────────────────────────────────────┘
```

### Verification Steps

1. HyperDX UI 접속: `http://localhost:8080`
2. Dashboards 메뉴 → Import Dashboard
3. `nodejs-runtime-dashboard.json` 파일 업로드
4. 10개 메트릭 패널 확인
5. Backend 실행 상태에서 데이터 유입 확인

### Key Observations

- **Event Loop Delay**: Node.js의 비동기 처리 성능 핵심 지표
  - P99 > 100ms 이상이면 성능 병목 의심
- **Event Loop Utilization**: CPU 포화 상태 지표
  - 0.8 (80%) 이상 지속시 스케일링 검토 필요
- **Active Handles/Requests**: 리소스 누수 탐지용
  - 지속적으로 증가하면 메모리 누수 의심
