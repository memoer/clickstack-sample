import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

interface ResponseType {
  timestamp: string;
  message: string;
  error: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = this.generateResponse(error);

    response
      .status(error.getStatus())
      .json({ result: "error", ...errorResponse });
  }

  private generateResponse(error: HttpException): ResponseType {
    const status = error.getStatus();
    const errorResponse = error.getResponse();

    if (typeof errorResponse === "string") {
      return {
        timestamp: new Date().toISOString(),
        message: errorResponse,
        error: HttpStatus[status] || HttpStatus[500],
      };
    } else {
      const resp = errorResponse as Record<string, unknown>;
      return {
        timestamp: new Date().toISOString(),
        message: (resp.message as string) || error.message,
        error: (resp.error as string) || HttpStatus[status] || HttpStatus[500],
      };
    }
  }
}
