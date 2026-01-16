import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { trace, SpanStatusCode } from "@opentelemetry/api";

@Controller()
export class AppController {
  private readonly tracer = trace.getTracer("app-controller");

  constructor() {}

  @Get("http")
  http() {
    throw new HttpException("test exception", HttpStatus.BAD_REQUEST);
  }

  @Get("error")
  error() {
    throw new Error("test error");
  }

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
