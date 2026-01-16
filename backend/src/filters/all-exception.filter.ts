import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

interface ResponseType {
  timestamp: string;
  message: string;
  error: string;
}

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = this.generateResponse(error);

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ result: "error", ...errorResponse });
  }

  private generateResponse(error: Error): ResponseType {
    return {
      timestamp: new Date().toISOString(),
      message: error.message,
      error: HttpStatus[500],
    };
  }
}
