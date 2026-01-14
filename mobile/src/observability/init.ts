import { HyperDXRum } from "@hyperdx/otel-react-native";
import Config from "react-native-config";

let initialized = false;

export const initObservability = (): void => {
  if (initialized) {
    return;
  }

  const apiKey = Config.HYPERDX_API_KEY;
  const serviceName = Config.SERVICE_NAME;
  const apiUrl = Config.API_URL;

  if (!apiKey) {
    console.warn("HYPERDX_API_KEY is not set. Observability disabled.");
    return;
  }

  HyperDXRum.init({
    apiKey,
    service: serviceName,
    tracePropagationTargets: apiUrl ? [new RegExp(apiUrl)] : [],
  });

  initialized = true;
};

export const setUserContext = (user: {
  userId?: string;
  userEmail?: string;
  userName?: string;
  [key: string]: string | undefined;
}): void => {
  const attributes: Record<string, string> = {};

  Object.entries(user).forEach(([key, value]) => {
    if (value !== undefined) {
      attributes[key] = value;
    }
  });

  HyperDXRum.setGlobalAttributes(attributes);
};
