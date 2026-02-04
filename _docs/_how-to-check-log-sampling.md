# How to Check Log Sampling

This guide explains how to verify that log sampling is working correctly in the OTEL Collector.

## Overview

Log sampling configuration:
- **ERROR, FATAL logs**: 100% retention (never dropped)
- **TRACE, DEBUG, INFO, WARN logs**: 10% sampling

## Architecture

```
OTLP Logs → logs (entry) → routing/logs connector
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            logs/errors                       logs/normal
         (severity >= ERROR)              (severity < ERROR)
            100% 보존                         10% 샘플링
                    │                               │
                    │                    probabilistic_sampler
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                               ClickStack
```

## Step 1: Check OTEL Collector Health

```bash
# Health check
curl -s http://localhost:13133/ | jq .

# Expected output:
# {
#   "status": "Server available",
#   "upSince": "2026-01-13T09:16:21.205Z",
#   "uptime": "..."
# }
```

## Step 2: Check Collector Logs for Pipeline Setup

```bash
docker logs clickstack-otel-otel-collector-1 2>&1 | grep -E "routing|probabilistic|logs"
```

Look for:
- No error messages about `routing/logs` or `probabilistic_sampler/logs`
- "Everything is ready. Begin running and processing data."

## Step 3: Generate Test Logs

### Normal Logs (INFO level)

```bash
# Generate 20 normal requests (INFO level logs)
for i in {1..20}; do
  curl -s http://localhost:3000/api/tasks > /dev/null
done
echo "Generated 20 normal requests"
```

### Error Logs (ERROR level)

To test error routing, you need to trigger actual ERROR-level logs in your application:

```typescript
// In your NestJS application
import { Logger } from '@nestjs/common';

const logger = new Logger('TestService');
logger.error('This is an error log');  // This will be 100% retained
logger.log('This is an info log');     // This will be 10% sampled
```

Or create an endpoint that throws an exception:

```bash
# If you have an endpoint that triggers real errors
curl http://localhost:3000/api/trigger-error
```

## Step 4: Check Sampling Metrics

Wait a few seconds for logs to be processed, then check metrics:

```bash
# Check processor metrics for logs
curl -s http://localhost:8888/metrics | grep -E "otelcol_processor.*(logs)" | grep -E "incoming|outgoing"
```

### Expected Output

```
otelcol_processor_incoming_items_total{...,processor="memory_limiter"} 20
otelcol_processor_outgoing_items_total{...,processor="memory_limiter"} 20
otelcol_processor_incoming_items_total{...,processor="probabilistic_sampler/logs"} 20
otelcol_processor_outgoing_items_total{...,processor="probabilistic_sampler/logs"} 2
```

### How to Interpret

| Metric | Meaning |
|--------|---------|
| `memory_limiter` incoming/outgoing | Total logs received (should be equal) |
| `probabilistic_sampler/logs` incoming | Logs sent to normal pipeline |
| `probabilistic_sampler/logs` outgoing | Logs after 10% sampling |

**Sampling ratio** = outgoing / incoming ≈ 10%

## Step 5: Verify in HyperDX UI

1. Open HyperDX UI: http://localhost:8080
2. Go to **Logs** section
3. Compare:
   - Total logs generated (from your application)
   - Logs visible in HyperDX (should be ~10% for normal logs)
4. Filter by severity:
   - ERROR logs: Should see 100% of them
   - INFO logs: Should see ~10% of them

## Quick Check Script

```bash
#!/bin/bash
echo "=== Log Sampling Status ==="
echo ""

# 1. Health check
echo "1. Health Check:"
curl -sf http://localhost:13133/ > /dev/null && echo "   ✓ Collector is healthy" || echo "   ✗ Collector is down"

# 2. Get processor metrics
echo ""
echo "2. Processor Metrics:"
metrics=$(curl -s http://localhost:8888/metrics 2>/dev/null)

mem_in=$(echo "$metrics" | grep 'processor_incoming.*memory_limiter.*logs' | grep -oE '[0-9]+$' | head -1)
mem_out=$(echo "$metrics" | grep 'processor_outgoing.*memory_limiter.*logs' | grep -oE '[0-9]+$' | head -1)
sampler_in=$(echo "$metrics" | grep 'processor_incoming.*probabilistic_sampler/logs' | grep -oE '[0-9]+$' | head -1)
sampler_out=$(echo "$metrics" | grep 'processor_outgoing.*probabilistic_sampler/logs' | grep -oE '[0-9]+$' | head -1)

echo "   memory_limiter:           ${mem_in:-0} in → ${mem_out:-0} out"
echo "   probabilistic_sampler:    ${sampler_in:-0} in → ${sampler_out:-0} out"

# 3. Calculate sampling rate
if [ -n "$sampler_in" ] && [ "$sampler_in" -gt 0 ]; then
  rate=$(echo "scale=1; $sampler_out * 100 / $sampler_in" | bc)
  echo ""
  echo "3. Sampling Rate: ${rate}% (target: 10%)"
fi

echo ""
echo "=== Done ==="
```

## Troubleshooting

### No logs appearing

1. Check if backend is sending logs:
   ```bash
   docker logs clickstack-otel-backend-1 2>&1 | tail -10
   ```

2. Check OTEL Collector is receiving data:
   ```bash
   curl -s http://localhost:8888/metrics | grep "otelcol_receiver_accepted"
   ```

### All logs going to normal pipeline (none to errors)

This is expected if your application isn't generating ERROR-level logs. HTTP 404s are typically logged as INFO/WARN, not ERROR.

To test error routing:
```typescript
// Add this to your NestJS service
this.logger.error('Test error message');
```

### Sampling rate not ~10%

- With small sample sizes, variance is high
- Generate more logs (50+) for accurate measurement
- Check `hash_seed` is consistent across restarts

### Config validation errors

```bash
# Validate config syntax
docker exec clickstack-otel-otel-collector-1 cat /etc/otel-collector-config.yaml
```

Common issues:
- Missing `context: log` in routing table
- Wrong exporter name in pipeline

## Severity Number Reference

| Level | Number Range | Pipeline |
|-------|--------------|----------|
| TRACE | 1-4 | logs/normal (10% sampled) |
| DEBUG | 5-8 | logs/normal (10% sampled) |
| INFO | 9-12 | logs/normal (10% sampled) |
| WARN | 13-16 | logs/normal (10% sampled) |
| ERROR | 17-20 | logs/errors (100% kept) |
| FATAL | 21-24 | logs/errors (100% kept) |

## Related Files

- OTEL Collector config: `data/otel-collector/otel-collector-config.yaml`
- Trace sampling guide: `_how-to-check-trace-tail-sampling.md`
- Config manual: `_otel-config-user-manual.md`
