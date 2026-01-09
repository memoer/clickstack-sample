import HyperDX from '@hyperdx/browser';

// Initialize HyperDX for Session Replay, Browser Logs, and Frontend Tracing
// This sends data to your local ClickStack instance

const HYPERDX_API_KEY = import.meta.env.VITE_HYPERDX_API_KEY || '';
const HYPERDX_APP_URL = import.meta.env.VITE_HYPERDX_URL || 'http://localhost:8080';

// Only initialize if we have configuration
if (HYPERDX_API_KEY) {
  HyperDX.init({
    // API Key from HyperDX UI -> Team Settings
    apiKey: HYPERDX_API_KEY,

    // Service name for this frontend app
    service: 'clickstack-demo-frontend',

    // Link frontend traces to backend traces
    tracePropagationTargets: [/localhost:3000/i, /api/i],

    // Capture console logs
    consoleCapture: true,

    // Capture full request/response data
    advancedNetworkCapture: true,

    // HyperDX app URL for self-hosted (session replay goes here)
    url: HYPERDX_APP_URL,
  });

  // Identify user (optional - useful for tracking specific users)
  // HyperDX.setGlobalAttributes({
  //   userId: 'demo-user-123',
  //   userEmail: 'demo@example.com',
  // });

  console.log('🔭 HyperDX initialized - Session Replay enabled');
  console.log(`   Sending telemetry to: ${HYPERDX_APP_URL}`);
}

export default HyperDX;
