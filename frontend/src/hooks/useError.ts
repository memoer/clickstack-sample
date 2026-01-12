import { useState } from "react";
import { Attributes } from "@opentelemetry/api";
import { recordException } from "../hyperdx/recorder";

export function recordError() {
  const [error, setError] = useState<string | null>(null);

  const captureError = (err: unknown, attributes?: Attributes | undefined) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    setError(message);
    recordException(err, message, attributes);
  };

  return { error, setError, captureError };
}
