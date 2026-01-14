import HyperDX from "@hyperdx/browser";

// Initialize HyperDX for Session Replay, Browser Logs, and Frontend Tracing
// This sends data to your local ClickStack instance

const HYPERDX_API_KEY = import.meta.env.VITE_HYPERDX_API_KEY;
const OTEL_ENDPOINT = import.meta.env.VITE_OTEL_ENDPOINT;

// Only initialize if we have configuration
if (HYPERDX_API_KEY && OTEL_ENDPOINT) {
  HyperDX.init({
    // Custom OTLP endpoint (for local ClickStack)
    url: OTEL_ENDPOINT,

    // API Key from HyperDX UI -> Team Settings (optional for local dev)
    apiKey: HYPERDX_API_KEY,

    // Service name for this frontend app
    service: import.meta.env.VITE_SERVICE_NAME,

    // Enable session recording (captures user interactions)
    tracePropagationTargets: [/localhost:3000/i, /api/i],

    // Console capture settings
    consoleCapture: false,

    // Advanced session replay settings
    advancedNetworkCapture: true,
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
