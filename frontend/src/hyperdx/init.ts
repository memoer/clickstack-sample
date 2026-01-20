import HyperDX from "@hyperdx/browser";

// Initialize HyperDX for Session Replay, Browser Logs, and Frontend Tracing
// This sends data to your local ClickStack instance

const HYPERDX_API_KEY = "6adecf01-7114-47a8-b1fe-bf0a9516a97d";
const OTEL_ENDPOINT = "http://localhost:4318";
const SERVICE_NAME = "clickstack-demo-frontend";

console.log("hyperdx init");
console.log(HYPERDX_API_KEY);
console.log(OTEL_ENDPOINT);
console.log(SERVICE_NAME);

// Only initialize if we have configuration
if (HYPERDX_API_KEY && OTEL_ENDPOINT) {
  HyperDX.init({
    // Custom OTLP endpoint (for local ClickStack)
    url: OTEL_ENDPOINT,

    // API Key from HyperDX UI -> Team Settings (optional for local dev)
    apiKey: HYPERDX_API_KEY,

    // Service name for this frontend app
    service: SERVICE_NAME,

    // Enable session recording (captures user interactions)
    tracePropagationTargets: [/localhost:3000/i, /api/i],

    // Console capture settings
    consoleCapture: false, // dev, stage에서만 켜기?

    // Advanced session replay settings
    advancedNetworkCapture: false, // dev, stage에서만 켜기?
  });

  // Identify user (optional - useful for tracking specific users)
  // HyperDX.setGlobalAttributes({
  //   userId: 'demo-user-123',
  //   userEmail: 'demo@example.com',
  // });

  console.log("🔭 HyperDX initialized - Session Replay enabled");
  console.log(`   Sending telemetry to: ${OTEL_ENDPOINT}`);
}

export default HyperDX;
