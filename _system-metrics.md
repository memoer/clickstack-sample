# System Metrics in ClickStack

This document explains system/infrastructure metrics (CPU, memory, disk, network) availability in ClickStack OTEL setup.

---

## Current Status

**Host-level system metrics are NOT configured** in this project.

The current setup focuses on **application-level observability** (traces, logs, Node.js runtime metrics) rather than **infrastructure-level observability** (host resource usage).

---

## What IS Currently Available

### Node.js Runtime Metrics

**Source**: `@opentelemetry/instrumentation-runtime-node` in `backend/src/tracing.ts`

| Metric | Type | Description |
|--------|------|-------------|
| `nodejs.eventloop.delay.min` | Gauge | Minimum event loop delay |
| `nodejs.eventloop.delay.max` | Gauge | Maximum event loop delay |
| `nodejs.eventloop.delay.mean` | Gauge | Average event loop delay |
| `nodejs.eventloop.delay.stddev` | Gauge | Standard deviation of delay |
| `nodejs.eventloop.delay.p50` | Gauge | 50th percentile delay |
| `nodejs.eventloop.delay.p90` | Gauge | 90th percentile delay |
| `nodejs.eventloop.delay.p99` | Gauge | 99th percentile delay |
| `nodejs.eventloop.utilization` | Gauge | Event loop utilization (0-1) |
| `nodejs.active_handles.total` | Gauge | Active libuv handles |
| `nodejs.active_requests.total` | Gauge | Active libuv requests |

**Export Interval**: 5 seconds

### HTTP Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `http.server.active_requests` | UpDownCounter | Current in-flight requests |
| `http.server.request.duration` | Histogram | Server-side request latency |
| `http.client.request.duration` | Histogram | Client-side request latency |

### OTEL Collector Internal Metrics

Available via Prometheus format on port **8888** (`http://localhost:8888/metrics`):

- `otelcol_receiver_accepted_spans`
- `otelcol_processor_incoming_items_total`
- `otelcol_processor_outgoing_items_total`
- Tail sampling statistics
- Memory utilization

---

## What's NOT Configured (Missing)

| Metric Type | Examples | Status |
|-------------|----------|--------|
| **CPU** | `system.cpu.utilization`, `system.cpu.time` | Not configured |
| **Memory** | `system.memory.usage`, `system.memory.utilization` | Not configured |
| **Disk** | `system.disk.io`, `system.disk.operations` | Not configured |
| **Network** | `system.network.io`, `system.network.packets` | Not configured |
| **Filesystem** | `system.filesystem.usage`, `system.filesystem.utilization` | Not configured |
| **Processes** | `system.processes.count`, `system.processes.created` | Not configured |
| **Load Average** | `system.cpu.load_average.1m/5m/15m` | Not configured |

---

## How to Add System Metrics

To collect host-level infrastructure metrics, add the **hostmetrics receiver** to the OTEL Collector configuration.

### Step 1: Update OTEL Collector Config

Edit `data/otel-collector/otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  # Add hostmetrics receiver
  hostmetrics:
    collection_interval: 15s
    scrapers:
      cpu:
      memory:
      disk:
      filesystem:
      network:
      processes:
      load:        # Linux only
      paging:

service:
  pipelines:
    metrics:
      receivers: [otlp, hostmetrics]  # Add hostmetrics here
      processors: [memory_limiter, batch]
      exporters: [otlphttp/clickstack]
```

### Step 2: Mount Host Paths (Docker)

When running in Docker, mount host system paths for accurate metrics:

```yaml
# docker-compose.db.yml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.116.1
    volumes:
      - ./data/otel-collector/otel-collector-config.yaml:/etc/otel-collector-config.yaml
      # Add these for hostmetrics
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /etc/hostname:/etc/hostname:ro
    environment:
      - HOST_PROC=/host/proc
      - HOST_SYS=/host/sys
```

### Step 3: Configure Root Path (Optional)

If using mounted paths, specify root path in config:

```yaml
receivers:
  hostmetrics:
    root_path: /host
    collection_interval: 15s
    scrapers:
      cpu:
      memory:
      # ...
```

---

## Available Scrapers

### cpu

Collects CPU utilization metrics.

| Metric | Description |
|--------|-------------|
| `system.cpu.time` | CPU time spent in each state (user, system, idle, etc.) |
| `system.cpu.utilization` | CPU utilization as percentage (0-1) |

**Attributes**: `cpu` (core number), `state` (user, system, idle, iowait, etc.)

### memory

Collects memory usage metrics.

| Metric | Description |
|--------|-------------|
| `system.memory.usage` | Memory usage in bytes |
| `system.memory.utilization` | Memory utilization as percentage (0-1) |

**Attributes**: `state` (used, free, buffered, cached, etc.)

### disk

Collects disk I/O metrics.

| Metric | Description |
|--------|-------------|
| `system.disk.io` | Bytes read/written |
| `system.disk.operations` | Number of read/write operations |
| `system.disk.io_time` | Time spent in I/O operations |
| `system.disk.operation_time` | Time spent on read/write operations |
| `system.disk.pending_operations` | Pending I/O operations |

**Attributes**: `device`, `direction` (read, write)

### filesystem

Collects filesystem usage metrics.

| Metric | Description |
|--------|-------------|
| `system.filesystem.usage` | Filesystem usage in bytes |
| `system.filesystem.utilization` | Filesystem utilization as percentage |
| `system.filesystem.inodes.usage` | Inode usage |

**Attributes**: `device`, `mountpoint`, `type`, `mode`, `state`

### network

Collects network I/O metrics.

| Metric | Description |
|--------|-------------|
| `system.network.io` | Bytes sent/received |
| `system.network.packets` | Packets sent/received |
| `system.network.errors` | Network errors |
| `system.network.dropped` | Dropped packets |
| `system.network.connections` | Active connections |

**Attributes**: `device`, `direction` (transmit, receive), `protocol`

### processes

Collects process count metrics.

| Metric | Description |
|--------|-------------|
| `system.processes.count` | Number of processes |
| `system.processes.created` | Total processes created |

**Attributes**: `status` (running, sleeping, stopped, zombie, etc.)

### process

Collects per-process metrics. Use `include`/`exclude` filters.

```yaml
scrapers:
  process:
    include:
      match_type: regexp
      names: ["node", "python", "java", "nginx"]
    mute_process_name_error: true
```

| Metric | Description |
|--------|-------------|
| `process.cpu.time` | CPU time consumed by process |
| `process.cpu.utilization` | CPU utilization of process |
| `process.memory.usage` | Memory used by process |
| `process.memory.virtual` | Virtual memory of process |
| `process.disk.io` | Disk I/O by process |
| `process.threads` | Thread count |

### load

Collects CPU load average (Linux/Unix only).

| Metric | Description |
|--------|-------------|
| `system.cpu.load_average.1m` | 1-minute load average |
| `system.cpu.load_average.5m` | 5-minute load average |
| `system.cpu.load_average.15m` | 15-minute load average |

### paging

Collects paging/swap metrics.

| Metric | Description |
|--------|-------------|
| `system.paging.usage` | Swap usage in bytes |
| `system.paging.utilization` | Swap utilization percentage |
| `system.paging.operations` | Page in/out operations |
| `system.paging.faults` | Page faults |

---

## Example Queries (ClickHouse)

### CPU Utilization Over Time

```sql
SELECT
  toStartOfMinute(Timestamp) as time,
  avg(Value) as cpu_utilization
FROM otel_metrics
WHERE MetricName = 'system.cpu.utilization'
  AND Attributes['state'] = 'user'
GROUP BY time
ORDER BY time DESC
LIMIT 60
```

### Memory Usage

```sql
SELECT
  Attributes['state'] as state,
  avg(Value) / 1024 / 1024 / 1024 as gb
FROM otel_metrics
WHERE MetricName = 'system.memory.usage'
GROUP BY state
```

### Disk I/O Rate

```sql
SELECT
  toStartOfMinute(Timestamp) as time,
  Attributes['device'] as device,
  Attributes['direction'] as direction,
  sum(Value) / 1024 / 1024 as mb
FROM otel_metrics
WHERE MetricName = 'system.disk.io'
GROUP BY time, device, direction
ORDER BY time DESC
```

### Network Traffic

```sql
SELECT
  toStartOfMinute(Timestamp) as time,
  Attributes['device'] as interface,
  sumIf(Value, Attributes['direction'] = 'receive') / 1024 / 1024 as rx_mb,
  sumIf(Value, Attributes['direction'] = 'transmit') / 1024 / 1024 as tx_mb
FROM otel_metrics
WHERE MetricName = 'system.network.io'
  AND Attributes['device'] NOT LIKE 'lo%'
GROUP BY time, interface
ORDER BY time DESC
```

### Top Processes by CPU

```sql
SELECT
  Attributes['process.executable.name'] as process,
  avg(Value) * 100 as cpu_percent
FROM otel_metrics
WHERE MetricName = 'process.cpu.utilization'
GROUP BY process
ORDER BY cpu_percent DESC
LIMIT 10
```

---

## Summary

| Category | Current Status | How to Enable |
|----------|----------------|---------------|
| Node.js Runtime | Available | Already configured |
| HTTP Metrics | Available | Already configured |
| CPU | Not available | Add `hostmetrics` receiver with `cpu` scraper |
| Memory | Not available | Add `hostmetrics` receiver with `memory` scraper |
| Disk I/O | Not available | Add `hostmetrics` receiver with `disk` scraper |
| Network | Not available | Add `hostmetrics` receiver with `network` scraper |
| Filesystem | Not available | Add `hostmetrics` receiver with `filesystem` scraper |
| Processes | Not available | Add `hostmetrics` receiver with `processes` scraper |

---

## Related Files

- OTEL Collector config: `data/otel-collector/otel-collector-config.yaml`
- Node.js runtime metrics: `_available-metrics.md`
- Tracing setup: `backend/src/tracing.ts`

## References

- [OpenTelemetry Host Metrics Receiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/hostmetricsreceiver)
- [OpenTelemetry System Metrics Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/system/system-metrics/)
- [OpenTelemetry Process Metrics Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/system/process-metrics/)
