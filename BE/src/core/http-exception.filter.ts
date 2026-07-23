import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const statusCode = exception.getStatus();
    const details = exception.getResponse();
    const payload =
      typeof details === 'string' ? { message: details } : details;

    response.status(statusCode).json({
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      ...payload,
    });
  }
}
