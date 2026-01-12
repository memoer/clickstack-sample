import HyperDX from "@hyperdx/browser";
import { Attributes } from "@opentelemetry/api";

export const recordAction = (message: string) => {
  const timestamp = new Date().toLocaleTimeString();
  HyperDX.addAction(message, { timestamp });
};

export const recordException = (
  err: unknown,
  message: string,
  attributes?: Attributes | undefined
) => {
  recordAction(`${err}`);
  HyperDX.recordException(err instanceof Error ? err : new Error(message), {
    operation: "fetchTasks",
    ...attributes,
  });
};
