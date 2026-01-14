import HyperDX from "@hyperdx/browser";
import { Attributes } from "@opentelemetry/api";

export const recordAction = (
  message: string,
  attrs?: Record<string, unknown>
) => {
  const timestamp = new Date().toLocaleTimeString();
  HyperDX.addAction(message, { timestamp, ...attrs });
};

export const recordException = (
  err: unknown,
  message: string,
  attributes?: Attributes | undefined
) => {
  HyperDX.recordException(err instanceof Error ? err : new Error(message), {
    operation: "fetchTasks",
    ...attributes,
  });
};
