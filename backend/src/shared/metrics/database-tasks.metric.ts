import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("database-tasks-service", "1.0.0");

// Counter: Total database task operations
export const dbTaskOperationsCounter = meter.createCounter(
  "db_tasks.operations.total",
  {
    description: "Total number of database task operations",
    unit: "1",
  }
);

// Histogram: Duration of database task operations
const dbTaskDurationHistogram = meter.createHistogram(
  "db_tasks.operation.duration",
  {
    description: "Duration of database task operations in milliseconds",
    unit: "ms",
  }
);

// UpDownCounter: Current number of active tasks per database
export const dbActiveTasksGauge = meter.createUpDownCounter(
  "db_tasks.active.count",
  {
    description: "Current number of active tasks per database",
    unit: "1",
  }
);

/**
 * Record metrics for a database operation
 */
export function recordDbMetrics(
  database: "mongodb" | "redis" | "postgres",
  operation: string,
  startTime: number,
  status: "success" | "error" | "not_found" = "success"
): void {
  const duration = Date.now() - startTime;
  dbTaskOperationsCounter.add(1, { database, operation, status });
  dbTaskDurationHistogram.record(duration, { database, operation });
}
