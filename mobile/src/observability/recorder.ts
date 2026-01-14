import { trace, SpanStatusCode, AttributeValue } from "@opentelemetry/api";

const tracer = trace.getTracer("clickstack-mobile-actions");

const sanitizeAttributes = (
  attrs?: Record<string, unknown>
): Record<string, AttributeValue> => {
  if (!attrs) return {};
  return Object.fromEntries(
    Object.entries(attrs).map(([key, value]) => [
      key,
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : String(value),
    ])
  );
};

export const recordAction = (
  message: string,
  attributes?: Record<string, unknown>
): void => {
  const span = tracer.startSpan(message);
  span.setAttributes({
    timestamp: new Date().toISOString(),
    "action.type": "user_action",
    ...sanitizeAttributes(attributes),
  });
  span.end();
};

export const recordException = (
  err: unknown,
  message: string,
  attributes?: Record<string, unknown>
): void => {
  const span = tracer.startSpan(`Error: ${message}`);
  span.setStatus({ code: SpanStatusCode.ERROR, message });

  const error = err instanceof Error ? err : new Error(String(err));
  span.recordException(error);

  span.setAttributes({
    "error.type": "exception",
    "error.message": error.message,
    ...sanitizeAttributes(attributes),
  });

  span.end();
};
