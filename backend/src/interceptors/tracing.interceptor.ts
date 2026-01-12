import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { trace, SpanStatusCode, context, Span } from "@opentelemetry/api";
import { Request } from "express";
import { Logger } from "../logger";
import { addHttpRequestCounter } from "./tracing.interceptor.metric";

interface RequestMeta {
  ip: string | undefined;
  userAgent: string | undefined;
  referer: string | undefined;
  acceptLanguage: string | undefined;
  contentType: string | undefined;
}

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);
  private readonly tracer = trace.getTracer(
    "tracing-interceptor",
    process.env.SERVICE_VERSION
  );

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = ctx.switchToHttp().getRequest<Request>();

    const { method, url, params, query, body } = request;
    const route = this.getRoutePattern(request);
    const requestBody = this.safeStringify(body);
    const requestMeta = this.extractRequestMeta(request);
    const userId = this.extractUserId(request);

    const className = ctx.getClass().name;
    const handlerName = ctx.getHandler().name;
    const spanName = `${className}.${handlerName}`;

    return new Observable(subscriber => {
      this.tracer.startActiveSpan(spanName, span => {
        const startTime = Date.now();

        this.setSpanAttributes(span, {
          method,
          url,
          className,
          handlerName,
          params,
          query,
        });

        // Request log inside span for trace context correlation
        this.logger.info(
          {
            type: "request",
            method,
            url,
            userId,
            ...requestMeta,
          },
          `→ ${method} ${url}`
        );

        context.with(trace.setSpan(context.active(), span), () => {
          next
            .handle()
            .pipe(
              tap(response => {
                this.onSuccess(
                  span,
                  startTime,
                  method,
                  url,
                  route,
                  userId,
                  response
                );
              }),
              catchError(error => {
                this.onError(
                  span,
                  startTime,
                  method,
                  url,
                  route,
                  requestBody,
                  userId,
                  error
                );
                return throwError(() => error);
              })
            )
            .subscribe({
              next: value => subscriber.next(value),
              error: err => subscriber.error(err),
              complete: () => {
                span.end();
                subscriber.complete();
              },
            });
        });
      });
    });
  }

  private getRoutePattern(request: Request): string {
    // Use Express route pattern if available, fallback to path
    return (request.route?.path as string) || request.path;
  }

  private safeStringify(obj: unknown, maxLength = 1000): string | undefined {
    if (obj === undefined || obj === null) return undefined;
    if (typeof obj === "object" && Object.keys(obj).length === 0)
      return undefined;
    try {
      const str = JSON.stringify(obj);
      return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
    } catch {
      return "[Unable to stringify]";
    }
  }

  private extractUserId(request: Request): string | null {
    const authHeader = request.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) return null;
    try {
      const token = authHeader.substring(7);
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString()
      );
      return payload.sub || payload.userId || payload.user_id || null;
    } catch {
      return null;
    }
  }

  private extractRequestMeta(request: Request): RequestMeta {
    // Get IP address (handle proxy scenarios)
    const forwardedFor = request.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(
        ","
      )[0] ||
      request.socket?.remoteAddress ||
      request.ip;

    const referer = request.headers["referer"] || request.headers["referrer"];
    const acceptLanguage = request.headers["accept-language"];

    return {
      ip,
      userAgent: request.headers["user-agent"],
      referer: Array.isArray(referer) ? referer[0] : referer,
      acceptLanguage: Array.isArray(acceptLanguage)
        ? acceptLanguage[0]
        : acceptLanguage,
      contentType: request.headers["content-type"],
    };
  }

  private setSpanAttributes(
    span: Span,
    ctx: {
      method: string;
      url: string;
      className: string;
      handlerName: string;
      params: Record<string, unknown>;
      query: Record<string, unknown>;
    }
  ): void {
    span.setAttribute("http.method", ctx.method);
    span.setAttribute("http.url", ctx.url);
    span.setAttribute("code.class", ctx.className);
    span.setAttribute("code.function", ctx.handlerName);

    if (Object.keys(ctx.params).length > 0) {
      span.setAttribute("http.route.params", JSON.stringify(ctx.params));
    }
    if (Object.keys(ctx.query).length > 0) {
      span.setAttribute("http.route.query", JSON.stringify(ctx.query));
    }
  }

  private onSuccess(
    span: Span,
    startTime: number,
    method: string,
    url: string,
    route: string,
    userId: string | null,
    response: unknown
  ): void {
    const duration = Date.now() - startTime;
    const statusCode = 200;
    const responseBody = this.safeStringify(response);

    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute("http.duration_ms", duration);
    span.setAttribute("http.status_code", statusCode);

    addHttpRequestCounter(method, route, statusCode);

    this.logger.info(
      {
        type: "response",
        method,
        url,
        duration,
        statusCode,
        userId,
        responseBody,
      },
      `← ${method} ${url} response in ${duration}ms`
    );
  }

  private onError(
    span: Span,
    startTime: number,
    method: string,
    url: string,
    route: string,
    requestBody: string | undefined,
    userId: string | null,
    error: Error
  ): void {
    const duration = Date.now() - startTime;
    const statusCode =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.setAttribute("http.duration_ms", duration);
    span.setAttribute("http.status_code", statusCode);

    span.recordException(error);

    addHttpRequestCounter(method, route, statusCode);

    this.logger.error(
      {
        type: "error",
        err: error,
        method,
        url,
        duration,
        statusCode,
        userId,
        requestBody,
      },
      `← ${method} ${url} error in ${duration}ms`
    );
  }
}
