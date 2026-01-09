import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { trace, SpanStatusCode, context, Span } from "@opentelemetry/api";
import { Request } from "express";
import { Logger } from "../logger";

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);
  private readonly tracer = trace.getTracer("nestjs-interceptor", "1.0.0");

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = ctx.switchToHttp().getRequest<Request>();
    const { method, url, body, params, query } = request;

    const className = ctx.getClass().name;
    const handlerName = ctx.getHandler().name;
    const spanName = `${className}.${handlerName}`;

    return new Observable(subscriber => {
      this.tracer.startActiveSpan(spanName, span => {
        const startTime = Date.now();

        this.setSpanAttributes(span, { method, url, className, handlerName, params, query });

        context.with(trace.setSpan(context.active(), span), () => {
          next.handle()
            .pipe(
              tap(response => {
                this.onSuccess(span, startTime, method, url, response);
              }),
              catchError(error => {
                this.onError(span, startTime, method, url, error);
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
    response: unknown
  ): void {
    const duration = Date.now() - startTime;

    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute("http.duration_ms", duration);

    this.logger.info(
      { method, url, duration },
      `${method} ${url} completed in ${duration}ms`
    );
  }

  private onError(
    span: Span,
    startTime: number,
    method: string,
    url: string,
    error: Error
  ): void {
    const duration = Date.now() - startTime;

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.setAttribute("http.duration_ms", duration);

    this.logger.error(
      { err: error, method, url, duration },
      `${method} ${url} failed after ${duration}ms`
    );
  }
}
