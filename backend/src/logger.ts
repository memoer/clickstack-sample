/**
 * Pino Logger with OpenTelemetry Integration (Class-based)
 *
 * 이 로거는 OpenTelemetry와 통합되어 있습니다:
 * - 모든 로그에 traceId, spanId가 자동으로 추가됨
 * - 로그가 OTLP를 통해 observability 백엔드로 전송됨
 * - 개발 환경에서는 pino-pretty로 가독성 있는 출력
 *
 * 사용법
 *   class TaskService {
 *     private readonly logger = new Logger(TaskService.name);
 *
 *     createTask() {
 *       this.logger.info({ taskId: '123' }, 'Task created');
 *     }
 *   }
 */

import pino, { Logger as PinoLogger } from "pino";
import { trace, context } from "@opentelemetry/api";

// ============================================================================
// Trace Context Mixin
// ============================================================================

/**
 * 모든 로그에 trace context를 자동으로 추가하는 mixin 함수
 * OpenTelemetry instrumentation-pino가 이 역할을 하지만,
 * 수동으로 추가하면 더 세밀한 제어가 가능합니다.
 */
function traceContextMixin(): object {
  const activeSpan = trace.getSpan(context.active());

  if (!activeSpan) {
    return {};
  }

  const spanContext = activeSpan.spanContext();

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

// ============================================================================
// Root Logger 설정
// ============================================================================

const transport =
  process.env.NODE_ENV === "prod"
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      };

const rootLogger: PinoLogger = pino({
  level: process.env.LOG_LEVEL || "info",

  mixin: traceContextMixin,

  base: {},

  timestamp: pino.stdTimeFunctions.isoTime,

  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },

  transport,
});

// ============================================================================
// Logger Class
// ============================================================================

type LogContext = Record<string, unknown>;

export class Logger {
  private readonly o: PinoLogger;

  constructor(name: string) {
    this.o = rootLogger.child({ logger: name });
  }

  debug(msg: string): void;
  debug(ctx: LogContext, msg: string): void;
  debug(ctxOrMsg: LogContext | string, msg?: string): void {
    if (typeof ctxOrMsg === "string") {
      this.o.debug(ctxOrMsg);
    } else {
      this.o.debug(ctxOrMsg, msg);
    }
  }

  info(msg: string): void;
  info(ctx: LogContext, msg: string): void;
  info(ctxOrMsg: LogContext | string, msg?: string): void {
    if (typeof ctxOrMsg === "string") {
      this.o.info(ctxOrMsg);
    } else {
      this.o.info(ctxOrMsg, msg);
    }
  }

  warn(msg: string): void;
  warn(ctx: LogContext, msg: string): void;
  warn(ctxOrMsg: LogContext | string, msg?: string): void {
    if (typeof ctxOrMsg === "string") {
      this.o.warn(ctxOrMsg);
    } else {
      this.o.warn(ctxOrMsg, msg);
    }
  }

  error(msg: string): void;
  error(ctx: LogContext, msg: string): void;
  error(err: Error, msg?: string): void;
  error(ctxOrErrOrMsg: LogContext | Error | string, msg?: string): void {
    if (typeof ctxOrErrOrMsg === "string") {
      this.o.error(ctxOrErrOrMsg);
    } else if (ctxOrErrOrMsg instanceof Error) {
      this.o.error({ err: ctxOrErrOrMsg }, msg ?? ctxOrErrOrMsg.message);
    } else {
      this.o.error(ctxOrErrOrMsg, msg);
    }
  }
}

export default rootLogger;
