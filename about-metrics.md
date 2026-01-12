# OpenTelemetry Metric Types Explained

A comprehensive guide to the four fundamental metric types and when to use each.

---

## 1. Counter (Monotonic)

**What it is**: A value that can **only increase** (or reset to zero on restart).

**When to use**:
- Counting events that accumulate over time
- Totals that never decrease naturally

| Use Case | Example Metric Name |
|----------|---------------------|
| HTTP requests received | `http.server.request.total` |
| Errors occurred | `app.errors.total` |
| Tasks completed | `tasks.completed.total` |
| Bytes sent | `network.bytes.sent` |

**Code Example** (NestJS/TypeScript):
```typescript
import { Counter } from '@opentelemetry/api';

// Create counter
const taskCompletedCounter: Counter = meter.createCounter('tasks.completed.total', {
  description: 'Total number of completed tasks',
  unit: '1',
});

// Usage - only increment
taskCompletedCounter.add(1, { status: 'success', priority: 'high' });
taskCompletedCounter.add(1, { status: 'failed', priority: 'low' });
```

**Key insight**: Use `.add(positive_value)` only. The rate of change is what matters (e.g., requests/second).

---

## 2. UpDownCounter (Non-Monotonic)

**What it is**: A value that can **increase AND decrease**.

**When to use**:
- Current state that fluctuates
- Resource utilization snapshots
- Queue depths, active connections

| Use Case | Example Metric Name |
|----------|---------------------|
| Active HTTP connections | `http.server.active_requests` |
| Queue size | `queue.pending.items` |
| Cache entries | `cache.entries.current` |
| Active users online | `users.active.current` |

**Code Example**:
```typescript
import { UpDownCounter } from '@opentelemetry/api';

// Create up-down counter
const activeTasksCounter: UpDownCounter = meter.createUpDownCounter('tasks.active.current', {
  description: 'Number of currently active tasks',
  unit: '1',
});

// Usage - can go up or down
async function processTask(task: Task) {
  activeTasksCounter.add(1);  // Task started -> increment
  try {
    await executeTask(task);
  } finally {
    activeTasksCounter.add(-1);  // Task finished -> decrement
  }
}
```

**Key insight**: Represents "current state" at any moment, not cumulative totals.

---

## 3. Gauge (Observable)

**What it is**: A value that represents a **point-in-time measurement**, collected via callback when scraped.

**When to use**:
- Measuring external state you don't control
- Snapshot values from system/runtime
- Values where you **read** current state rather than **track** changes

| Use Case | Example Metric Name |
|----------|---------------------|
| CPU usage percentage | `system.cpu.utilization` |
| Memory usage | `process.memory.heap.used` |
| Thread pool size | `jvm.threads.count` |
| Temperature sensor | `sensor.temperature.current` |
| Database connection pool size | `db.pool.connections.total` |

**Code Example**:
```typescript
import { ObservableGauge } from '@opentelemetry/api';

// Create observable gauge with callback
meter.createObservableGauge('process.memory.heap.used', {
  description: 'Current heap memory usage',
  unit: 'bytes',
}, (observableResult) => {
  const memoryUsage = process.memoryUsage();
  observableResult.observe(memoryUsage.heapUsed);
});

// Example: Database connection pool gauge
meter.createObservableGauge('db.pool.connections.active', {
  description: 'Current number of active database connections',
  unit: '1',
}, (observableResult) => {
  const poolStats = connectionPool.getStats();
  observableResult.observe(poolStats.activeConnections, { pool: 'primary' });
  observableResult.observe(poolStats.idleConnections, { pool: 'replica' });
});
```

**Key insight**: Unlike UpDownCounter (which you update imperatively), Gauge uses a **pull model**—the callback runs when metrics are collected, ensuring you always report the current state.

---

## 4. Histogram

**What it is**: Records **distribution of values** (buckets, sum, count).

**When to use**:
- Measuring durations/latencies
- Request/response sizes
- Any value where you care about percentiles (p50, p95, p99)

| Use Case | Example Metric Name |
|----------|---------------------|
| Request latency | `http.server.duration` |
| Response body size | `http.server.response.size` |
| Database query time | `db.query.duration` |
| Task processing time | `tasks.processing.duration` |

**Code Example**:
```typescript
import { Histogram } from '@opentelemetry/api';

// Create histogram
const taskDurationHistogram: Histogram = meter.createHistogram('tasks.processing.duration', {
  description: 'Time taken to process tasks',
  unit: 'ms',
});

// Usage - record individual measurements
async function processTask(task: Task) {
  const startTime = Date.now();
  try {
    await executeTask(task);
  } finally {
    const duration = Date.now() - startTime;
    taskDurationHistogram.record(duration, {
      taskType: task.type,
      priority: task.priority
    });
  }
}
```

**Key insight**: Automatically gives you min, max, average, percentiles, and distribution buckets.

---

## Gauge vs UpDownCounter: When to Use Which?

| Scenario | Use This | Why |
|----------|----------|-----|
| Tracking active requests in your code | UpDownCounter | You control when requests start/end |
| Reading JVM heap memory | Gauge | External value, just read it |
| Queue items you add/remove | UpDownCounter | You control the operations |
| Database pool size from driver | Gauge | External library manages it |
| Cache hit ratio | Gauge | Computed value at scrape time |

**Rule of thumb**:
- **UpDownCounter**: You **mutate** the value (add/subtract)
- **Gauge**: You **observe** the value (read current state)

---

## Quick Decision Tree

```
What are you measuring?
|
+-- Events that accumulate? (requests, errors, completions)
|   +-- Use COUNTER
|
+-- Current state that fluctuates?
|   |
|   +-- You control the changes (add/remove items)?
|   |   +-- Use UP-DOWN COUNTER
|   |
|   +-- External state you just read (memory, CPU, pool)?
|       +-- Use GAUGE
|
+-- Values where distribution matters? (latency, size)
    +-- Use HISTOGRAM
```

---

## Comparison Table

| Aspect | Counter | UpDownCounter | Histogram | Gauge |
|--------|---------|---------------|-----------|-------|
| Direction | Only up | Up and down | N/A (records values) | Any (observed) |
| Update model | Push (you call add) | Push (you call add) | Push (you call record) | Pull (callback) |
| Reset on restart | Yes | Yes | Yes | N/A (always current) |
| Typical queries | Rate (per second) | Current value | Percentiles, avg | Current value |
| Memory overhead | Low | Low | Higher (buckets) | Low |
| Example | `requests.total` | `connections.active` | `request.duration` | `memory.heap.used` |

---

## Best Practices

1. **Counter vs UpDownCounter**: If you're ever tempted to subtract from a Counter, you need an UpDownCounter instead

2. **UpDownCounter vs Gauge**: If you're reading state from an external source (runtime, driver, OS), use Gauge. If you're tracking changes you make, use UpDownCounter

3. **Histogram bucket boundaries**: Default buckets may not fit your use case—customize for your latency profile (e.g., `[5, 10, 25, 50, 100, 250, 500, 1000]` ms)

4. **Gauge callback performance**: Keep Gauge callbacks fast and non-blocking—they run on every scrape interval

5. **Attributes (labels)**: All four types support attributes for dimensional slicing—but high-cardinality attributes (like user IDs) will explode your metric storage
