import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("http-service", "1.0.0");

// ==========================================================================
// Counter: HTTP requests total
// ==========================================================================
export const httpRequestsCounter = meter.createCounter("http.requests.total", {
  description: "Total number of HTTP requests",
  unit: "1",
});

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Record an HTTP request metric with attributes
 * @param method - HTTP method (GET, POST, etc.)
 * @param route - Route pattern (e.g., /api/tasks/:id)
 * @param statusCode - HTTP status code
 */
export function addHttpRequestCounter(
  method: string,
  route: string,
  statusCode: number
): void {
  const status = statusCode >= 400 ? "error" : "success";
  httpRequestsCounter.add(1, {
    method,
    route,
    status,
    status_code: statusCode.toString(),
  });
}
