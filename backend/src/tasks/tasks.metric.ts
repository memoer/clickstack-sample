import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("tasks-service", "1.0.0");

// Counter: 총 작업 수
export const taskOperationsCounter = meter.createCounter(
  "tasks.operations.total",
  {
    description: "Total number of task operations",
    unit: "1",
  }
);

// Histogram: 작업 처리 시간
export const taskDurationHistogram = meter.createHistogram(
  "tasks.operation.duration",
  {
    description: "Duration of task operations in milliseconds",
    unit: "ms",
  }
);

// UpDownCounter: 현재 활성 태스크 수
export const activeTasksGauge = meter.createUpDownCounter(
  "tasks.active.count",
  {
    description: "Current number of active tasks",
    unit: "1",
  }
);

// Counter: 에러 수
export const taskErrorsCounter = meter.createCounter("tasks.errors.total", {
  description: "Total number of task operation errors",
  unit: "1",
});
