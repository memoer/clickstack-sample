# Debugging Guide: No Data Visible in HyperDX

This guide documents the systematic troubleshooting approach when telemetry data (logs, traces, metrics) doesn't appear in the HyperDX UI.

## Problem Symptom

- HyperDX UI shows "Loading HyperDX..." indefinitely
- Search returns "No Results"
- Backend appears to be running normally

## Debugging Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Problem: "Loading HyperDX..." stuck                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Verify Container Status                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ docker-compose ps                                                         │
│                                                                             │
│ Result: clickstack (unhealthy), backend (running), frontend (running)       │
│ Insight: "unhealthy" = healthcheck failing, but container is up             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Check Backend Logs                                                  │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ docker-compose logs backend --tail 20                                     │
│                                                                             │
│ Result: Logs showing traceId, spanId → Backend IS generating telemetry ✓    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Check ClickHouse for Data                                           │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ docker exec clickstack-otel-clickstack-1 \                                │
│     clickhouse-client --query "SELECT count() FROM otel_logs"               │
│                                                                             │
│ Result: 0 logs, 0 traces → Data NOT reaching ClickHouse ✗                   │
│ Insight: Problem is between Backend → Collector → ClickHouse                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 4: Test OTLP Endpoint Directly                                         │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ curl -s -o /dev/null -w "%{http_code}" \                                  │
│     -X POST http://localhost:4318/v1/traces \                               │
│     -H "Content-Type: application/json" \                                   │
│     -d '{"resourceSpans":[]}'                                               │
│                                                                             │
│ Result: 401 Unauthorized ← ROOT CAUSE FOUND!                                │
│ Insight: OTLP endpoint requires authentication                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 5: Test with Auth Header                                               │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ curl -s -o /dev/null -w "%{http_code}" \                                  │
│     -X POST http://localhost:4318/v1/traces \                               │
│     -H "authorization: <your-api-key>" \                                    │
│     -d '{"resourceSpans":[]}'                                               │
│                                                                             │
│ Result: 200 OK → Auth works when header is correct ✓                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 6: Check Backend's Actual Environment Variable                         │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ docker exec clickstack-otel-backend-1 printenv | grep OTEL                │
│                                                                             │
│ Result: OTEL_EXPORTER_OTLP_HEADERS="authorization=5f225f1b-..."             │
│                                     ↑                      ↑                │
│                              LITERAL QUOTES INCLUDED!                       │
│                                                                             │
│ Expected: authorization=5f225f1b-...                                        │
│ Actual:   "authorization=5f225f1b-..."  ← quotes are part of the value!     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 7: Fix docker-compose.yml                                              │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Before (wrong):                                                             │
│   - OTEL_EXPORTER_OTLP_HEADERS="authorization=5f225f1b-..."                 │
│                                                                             │
│ After (correct):                                                            │
│   - OTEL_EXPORTER_OTLP_HEADERS=authorization=5f225f1b-...                   │
│                                                                             │
│ $ docker-compose up -d backend  # Recreate with fixed env                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 8: Verify Fix                                                          │
│ ─────────────────────────────────────────────────────────────────────────── │
│ $ curl http://localhost:3000/tasks  # Generate telemetry                    │
│ $ docker exec clickstack-otel-clickstack-1 \                                │
│     clickhouse-client --query "SELECT count() FROM otel_logs"               │
│                                                                             │
│ Result: 16 logs, 9 traces → DATA FLOWING! ✓                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Debugging Techniques

| Step | Technique | Why It Works |
|------|-----------|--------------|
| 1 | `docker-compose ps` | Quick health status overview |
| 2 | `docker-compose logs` | Check if source is generating data |
| 3 | **Direct DB query** | Confirms if data reaches storage (bypasses UI) |
| 4 | **curl OTLP endpoint** | Isolates network/auth issues |
| 5 | `printenv` inside container | See **actual** env values, not yaml definition |

## Pipeline Bisection Strategy

When debugging telemetry pipelines, always "bisect" to isolate the problem:

```text
Backend App → OTLP Exporter → Collector → ClickHouse → HyperDX UI
     ↓              ↓             ↓            ↓            ↓
  Check logs    Test curl     Check logs   Query DB    Refresh UI
```

The first stage with missing/failing data is where the problem lies.

## Common Issues & Solutions

### 1. Authentication Errors (401)

**Symptom**: OTLP endpoint returns 401 Unauthorized

**Check**:
```bash
# Test without auth
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" -d '{}'

# Test with auth
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" -H "authorization: <api-key>" -d '{}'
```

**Solution**: Ensure `OTEL_EXPORTER_OTLP_HEADERS` is set correctly without extra quotes.

### 2. YAML Quoting Gotcha

**Wrong** (quotes become part of the value):
```yaml
environment:
  - OTEL_EXPORTER_OTLP_HEADERS="authorization=xxx"
```

**Correct**:
```yaml
environment:
  - OTEL_EXPORTER_OTLP_HEADERS=authorization=xxx
```

### 3. Network Connectivity

**Check if backend can reach collector**:
```bash
docker exec clickstack-otel-backend-1 curl -s http://clickstack:4318/v1/traces
```

### 4. Collector Not Processing

**Check collector logs**:
```bash
docker exec clickstack-otel-clickstack-1 cat /var/log/otel-collector.log | tail -50
```

### 5. ClickHouse Not Receiving Data

**Direct query**:
```bash
docker exec clickstack-otel-clickstack-1 clickhouse-client \
  --query "SELECT count() FROM otel_logs"
docker exec clickstack-otel-clickstack-1 clickhouse-client \
  --query "SELECT count() FROM otel_traces"
```

## Useful Commands Reference

```bash
# Container status
docker-compose ps

# Service logs
docker-compose logs <service> --tail 50
docker-compose logs clickstack --tail 50
docker-compose logs backend --tail 50

# Environment variables inside container
docker exec <container> printenv | grep OTEL

# ClickHouse queries
docker exec <clickstack-container> clickhouse-client --query "SELECT count() FROM otel_logs"
docker exec <clickstack-container> clickhouse-client --query "SELECT count() FROM otel_traces"
docker exec <clickstack-container> clickhouse-client --query "SELECT * FROM otel_logs LIMIT 5"

# Internal logs
docker exec <clickstack-container> cat /var/log/otel-collector.log | tail -30
docker exec <clickstack-container> cat /var/log/app.log | tail -30

# Test OTLP endpoint
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" -d '{"resourceSpans":[]}'

# Restart specific service
docker-compose up -d backend
```

## Lessons Learned

1. **Container env != YAML definition**: Always verify with `docker exec ... printenv` because Docker might interpret values differently than you expect.

2. **Bisect the pipeline**: When data doesn't appear, check each stage systematically. The first stage with missing data is where the problem lies.

3. **Direct DB queries**: Don't trust the UI alone. Query the database directly to confirm if data is being stored.

4. **Test endpoints manually**: Use `curl` to test OTLP endpoints directly to isolate authentication and network issues.
