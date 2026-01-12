import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { trace, context } from "@opentelemetry/api";
import { Logger } from "../logger";

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  traceId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { status, message, error } = this.extractErrorInfo(exception);
    const traceId = this.getTraceId();

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(traceId && { traceId }),
    };

    this.logException(exception, status, request, traceId);

    response.status(status).json(errorResponse);
  }

  private extractErrorInfo(exception: unknown): {
    status: number;
    message: string;
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        return {
          status,
          message: exceptionResponse,
          error: HttpStatus[status] || "Error",
        };
      }

      const resp = exceptionResponse as Record<string, unknown>;
      return {
        status,
        message: (resp.message as string) || exception.message,
        error: (resp.error as string) || HttpStatus[status] || "Error",
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        exception instanceof Error
          ? exception.message
          : "Internal server error",
      error: "Internal Server Error",
    };
  }

  private getTraceId(): string | undefined {
    const span = trace.getSpan(context.active());
    return span?.spanContext().traceId;
  }

  private logException(
    exception: unknown,
    status: number,
    request: Request,
    traceId?: string
  ): void {
    const logContext = {
      statusCode: status,
      method: request.method,
      path: request.url,
      ...(traceId && { traceId }),
    };

    if (status >= 500) {
      this.logger.error(
        {
          ...logContext,
          err: exception instanceof Error ? exception : undefined,
        },
        `[${status}] ${request.method} ${request.url}`
      );
    } else if (status >= 400) {
      this.logger.warn(
        logContext,
        `[${status}] ${request.method} ${request.url}`
      );
    }
  }
}
