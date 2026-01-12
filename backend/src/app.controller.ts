import { Controller, Get } from "@nestjs/common";
import { Logger } from "./logger";
import { trace, SpanStatusCode } from "@opentelemetry/api";

@Controller()
export class AppController {
  private readonly tracer = trace.getTracer("app-controller");
  private readonly logger = new Logger(AppController.name);

  constructor() {}

  @Get("health")
  getHealth() {
    return this.tracer.startActiveSpan("health-check", span => {
      try {
        const result = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        };

        span.setAttribute("health.status", "healthy");
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } finally {
        span.end();
      }
    });
  }
}
