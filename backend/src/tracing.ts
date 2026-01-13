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
 *
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// ============================================================================
// 환경 변수 설정
// ============================================================================

const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT; // OTLP 엔드포인트 (벤더 전환 시 이것만 변경!)
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME; // 서비스 정보
const SERVICE_VERSION = process.env.SERVICE_VERSION; // 서비스 정보
const DEPLOYMENT_ENV = process.env.NODE_ENV; // 서비스 정보
const AUTH_HEADER = process.env.OTEL_EXPORTER_OTLP_HEADERS; // 인증 헤더 (선택사항 - 벤더에 따라 필요)

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

// Trace Exporter (gRPC - no URL path needed)
// SDK는 100% 트레이스를 전송, Collector에서 tail-based sampling 수행
const traceExporter = new OTLPTraceExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,
  headers,
});

// Metric Exporter (gRPC - no URL path needed)
const metricExporter = new OTLPMetricExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,
  headers,
});

// Log Exporter (gRPC - no URL path needed)
const logExporter = new OTLPLogExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,
  headers,
});

// ============================================================================
// SDK 초기화
// ============================================================================

const sdk = new NodeSDK({
  // 서비스 리소스 정보
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "service.env": DEPLOYMENT_ENV,
  }),

  // Trace Exporter
  traceExporter,

  // Metric Reader
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 5_000,
  }),

  // Log Processor
  logRecordProcessors: [
    new BatchLogRecordProcessor(logExporter, {
      maxExportBatchSize: 512, // logs per batch
      scheduledDelayMillis: 5000, // flush interval (ms)
      exportTimeoutMillis: 30000, // export timeout (ms)
      maxQueueSize: 2048, // max buffered before dropping
    }),
  ],

  // Auto Instrumentations
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },

      "@opentelemetry/instrumentation-http": {
        ignoreIncomingRequestHook: request => {
          const url = request.url || "";
          return url === "/health" || url === "/metrics";
        },
        // Skip tracing for OTLP exporter calls
        ignoreOutgoingRequestHook: request => {
          const host = request.hostname || request.host || "";
          return host.includes("otel-collector"); // OTLP collector
        },
      },

      "@opentelemetry/instrumentation-pino": {
        logHook: (span, record) => {},
      },

      // PostgreSQL (pg) - disabled because Prisma uses its own query engine
      // If you use raw `pg` queries elsewhere, re-enable this
      "@opentelemetry/instrumentation-pg": { enabled: false },

      // Redis (ioredis) - capture commands
      "@opentelemetry/instrumentation-ioredis": {
        dbStatementSerializer: (cmdName, cmdArgs) => {
          // Serialize command for span attribute (redact sensitive values if needed)
          return `${cmdName} ${cmdArgs
            .map(arg =>
              typeof arg === "string" && arg.length > 100
                ? arg.substring(0, 100) + "..."
                : arg
            )
            .join(" ")}`;
        },
      },

      // MongoDB (via Mongoose) - enhanced tracing
      "@opentelemetry/instrumentation-mongodb": {
        enhancedDatabaseReporting: true, // include db.statement with query details
      },
    }),

    // Runtime metrics (heap, event loop, active handles)
    new RuntimeNodeInstrumentation({
      monitoringPrecision: 5_000, // collect every 5s (matches metric export interval)
    }),

    // Prisma ORM tracing
    new PrismaInstrumentation(),
  ],
});

// SDK 시작
sdk.start();

console.log("════════════════════════════════════════════════════════════");
console.log("🔭 OpenTelemetry SDK Initialized");
console.log(`   Service:     ${SERVICE_NAME}`);
console.log(`   Version:     ${SERVICE_VERSION}`);
console.log(`   Environment: ${DEPLOYMENT_ENV}`);
console.log(`   OTLP Target: ${OTEL_EXPORTER_OTLP_ENDPOINT}`);
console.log(`   Node.js:     ${process.version}`);
console.log("");
console.log("   📝 Logs:    Pino → OTLP → Backend");
console.log("   📊 Metrics: OpenTelemetry API → OTLP → Backend");
console.log("   🔍 Traces:  100% → Collector (tail-based sampling)");
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
