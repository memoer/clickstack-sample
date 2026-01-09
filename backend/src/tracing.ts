/**
 * OpenTelemetry SDK 초기화 (Vendor-neutral)
 *
 * 이 설정은 OTLP 프로토콜을 지원하는 어떤 백엔드로도 전환 가능합니다:
 * - ClickStack (HyperDX)
 * - Jaeger
 * - Zipkin
 * - Grafana Tempo
 * - Datadog
 * - New Relic
 * - Honeycomb
 * - 등등...
 *
 * 전환 방법: OTEL_EXPORTER_OTLP_ENDPOINT 환경변수만 변경하면 됩니다!
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// Note: ATTR_DEPLOYMENT_ENVIRONMENT_NAME is in the incubating subpath export
// which requires moduleResolution: node16+. Using string literal for compatibility.
const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";

// ============================================================================
// 환경 변수 설정
// ============================================================================

const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT; // OTLP 엔드포인트 (벤더 전환 시 이것만 변경!)
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME; // 서비스 정보
const SERVICE_VERSION = process.env.SERVICE_VERSION; // 서비스 정보
const DEPLOYMENT_ENV = process.env.NODE_ENV || "dev"; // 서비스 정보
const AUTH_HEADER = process.env.OTEL_EXPORTER_OTLP_HEADERS || ""; // 인증 헤더 (선택사항 - 벤더에 따라 필요)

const headers: Record<string, string> = {};
if (AUTH_HEADER) {
  // 형식: "key1=value1,key2=value2" 또는 "Authorization=Bearer xxx"
  AUTH_HEADER.split(",").forEach(pair => {
    const [key, value] = pair.split("=");
    if (key && value) {
      headers[key.trim()] = value.trim();
    }
  });
}

// ============================================================================
// Exporters 설정
// ============================================================================

// Trace Exporter
const traceExporter = new OTLPTraceExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  headers,
});

// Metric Exporter
const metricExporter = new OTLPMetricExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  headers,
});

// Log Exporter
const logExporter = new OTLPLogExporter({
  url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
  headers,
});

// ============================================================================
// SDK 초기화
// ============================================================================

const sdk = new NodeSDK({
  // 서비스 리소스 정보
  resource: new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: DEPLOYMENT_ENV,
  }),

  // Trace Exporter
  traceExporter,

  // Metric Reader (10초마다 내보냄)
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  }),

  // Log Processor
  logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],

  // Auto Instrumentations
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-pino": {
        logHook: (span, record) => {
          record["resource.service.name"] = SERVICE_NAME;
        },
      },
    }),
  ],
});

// SDK 시작
sdk.start();

console.log("════════════════════════════════════════════════════════════");
console.log("🔭 OpenTelemetry SDK Initialized (Vendor-neutral)");
console.log("════════════════════════════════════════════════════════════");
console.log(`   Service:     ${SERVICE_NAME}`);
console.log(`   Version:     ${SERVICE_VERSION}`);
console.log(`   Environment: ${DEPLOYMENT_ENV}`);
console.log(`   OTLP Target: ${OTEL_EXPORTER_OTLP_ENDPOINT}`);
console.log(`   Node.js:     ${process.version}`);
console.log("");
console.log("   📝 Logs:    Pino → OTLP → Backend");
console.log("   📊 Metrics: OpenTelemetry API → OTLP → Backend");
console.log("   🔍 Traces:  Auto-instrumentation → OTLP → Backend");
console.log("════════════════════════════════════════════════════════════");

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down OpenTelemetry SDK...");
  await sdk.shutdown();
  console.log("OpenTelemetry SDK shut down successfully");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default sdk;
