// ⚠️ dotenv must be loaded FIRST, before any process.env access
import "dotenv/config";
// ⚠️ IMPORTANT: tracing must be imported FIRST, before any other imports!
import "./tracing";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "./logger";
import { GlobalExceptionFilter } from "./filters/http-exception.filter";
import { TracingInterceptor } from "./interceptors/tracing.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global Interceptor & Filter
  app.useGlobalInterceptors(new TracingInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS 설정
  app.enableCors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.info(
    { port, env: process.env.NODE_ENV || "dev" },
    `🚀 Application is running ${port}`
  );
}

bootstrap().catch(error => {
  const logger = new Logger("Bootstrap");
  logger.error(error, "Failed to start application");
  process.exit(1);
});
