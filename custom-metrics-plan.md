# Plan: Add General HTTP Metrics to Backend

## Summary

Add custom HTTP metrics for request tracking and error rates monitoring.

---

## Requirements Analysis

| # | Requirement | Status | Metric Type | Implementation |
|---|-------------|--------|-------------|----------------|
| 1 | Requests by endpoint | Need | Counter | Custom |
| 2 | Errors by endpoint | Need | Counter | Merged into #1 with `status` attribute |
| 3 | Successes by endpoint | Need | Counter | Merged into #1 with `status` attribute |
| 4 | Active HTTP connections | Auto | UpDownCounter | `http.server.active_requests` (skip) |
| 5 | Latency per endpoint | Auto | Histogram | `http.server.request.duration` (skip) |
| 6 | p50, p95, p99 | Auto | Histogram | From duration histogram (skip) |

**User Decisions:**
- Counter design: Single counter with `status` attribute (`success`/`error`)

---

## Metrics to Implement

### 1. `http.requests.total` (Counter)

```typescript
meter.createCounter('http.requests.total', {
  description: 'Total HTTP requests',
  unit: '1',
});

// Attributes:
// - method: GET, POST, PUT, DELETE, PATCH
// - route: /api/tasks, /api/tasks/:id
// - status: success | error
// - status_code: 200, 201, 400, 404, 500
```

---

## Implementation Steps

### Step 1: Create HTTP Metrics File

**File:** `backend/src/metrics/http.metric.ts`

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('http-service', '1.0.0');

// Counter: HTTP requests total
export const httpRequestsCounter = meter.createCounter('http.requests.total', {
  description: 'Total number of HTTP requests',
  unit: '1',
});

// Helper: Record HTTP request
export function addHttpRequestCounter(
  method: string,
  route: string,
  statusCode: number,
): void {
  const status = statusCode >= 400 ? 'error' : 'success';
  httpRequestsCounter.add(1, {
    method,
    route,
    status,
    status_code: statusCode.toString(),
  });
}
```

### Step 2: Extend Tracing Interceptor

**File:** `backend/src/interceptors/tracing.interceptor.ts`

Key changes to existing methods:

#### 2.1 Add imports and helpers

```typescript
import { addHttpRequestCounter } from '../metrics/http.metric';
import { HttpException, HttpStatus } from '@nestjs/common';

// Add to class:
private getRoutePattern(request: Request): string {
  // Use Express route pattern if available, fallback to path
  return request.route?.path || request.path;
}
```

#### 2.2 Modify `onSuccess` method (add route param)

```typescript
private onSuccess(
  span: Span,
  startTime: number,
  method: string,
  url: string,
  route: string,
  response: unknown
): void {
  const duration = Date.now() - startTime;
  const statusCode = 200; // Success defaults to 200

  span.setStatus({ code: SpanStatusCode.OK });
  span.setAttribute("http.duration_ms", duration);
  span.setAttribute("http.status_code", statusCode);

  // Record HTTP metric
  addHttpRequestCounter(method, route, statusCode);

  this.logger.info(/* ... */);
}
```

#### 2.3 Modify `onError` method (extract status code from exception)

```typescript
private onError(
  span: Span,
  startTime: number,
  method: string,
  url: string,
  route: string,
  error: Error
): void {
  const duration = Date.now() - startTime;
  const statusCode = error instanceof HttpException
    ? error.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;

  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.recordException(error);
  span.setAttribute("http.duration_ms", duration);
  span.setAttribute("http.status_code", statusCode);

  // Record HTTP metric
  addHttpRequestCounter(method, route, statusCode);

  this.logger.error(/* ... */);
}
```

#### 2.4 Update `intercept` method

```typescript
intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
  const request = ctx.switchToHttp().getRequest<Request>();
  const { method, url, params, query } = request;
  const route = this.getRoutePattern(request);

  // ... rest of existing code, pass `route` to onSuccess/onError
}
```

### Step 3: Update enabled-metrics.md

Add documentation for new metrics.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/metrics/http.metric.ts` | Create | HTTP metrics definitions |
| `backend/src/interceptors/tracing.interceptor.ts` | Modify | Add metric recording |
| `enabled-metrics.md` | Update | Document new metrics |

---

## Verification

1. **Build check:**
   ```bash
   npm run build
   ```

2. **Start server and make requests:**
   ```bash
   npm run start:dev
   curl http://localhost:3000/api/tasks
   curl http://localhost:3000/api/tasks/invalid-id  # trigger 404
   ```

3. **Check ClickStack:**
   - Verify `http.requests.total` counter appears
   - Check attributes: method, route, status, status_code

4. **ClickHouse queries to verify:**
   ```sql
   -- Request counts
   SELECT * FROM otel_metrics_sum
   WHERE MetricName = 'http.requests.total'
   ORDER BY TimeUnix DESC LIMIT 10;
   ```

---

## ClickStack Visualization

### Success/Error Rate Query

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  Attributes['status'] as status,
  sum(Value) as count
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY time, status
ORDER BY time
```

### Requests per Endpoint

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

### Error Rate Percentage

```sql
SELECT
  toStartOfMinute(TimeUnix) as time,
  100.0 * sumIf(Value, Attributes['status'] = 'error') / sum(Value) as error_rate
FROM otel_metrics_sum
WHERE MetricName = 'http.requests.total'
GROUP BY time
ORDER BY time
```
