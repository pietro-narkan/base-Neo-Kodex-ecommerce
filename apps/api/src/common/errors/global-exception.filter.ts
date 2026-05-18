import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { requestContext } from '../request-context';
import { captureFromFilter } from '../sentry';
import { AppException } from './app-exception';

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

const PRISMA_CODE_MAP: Record<string, { status: number; code: string }> = {
  P2002: { status: 409, code: 'RESOURCE_CONFLICT' },
  P2025: { status: 404, code: 'RESOURCE_NOT_FOUND' },
  P2003: { status: 409, code: 'RESOURCE_CONFLICT' },
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status(code: number): { send(body: unknown): void };
    }>();
    const request = ctx.getRequest<{ id?: string }>();
    const requestId =
      requestContext.getStore()?.requestId ?? request.id ?? undefined;

    const { status, payload } = this.normalize(exception);
    const responseBody: { error: ErrorPayload } = {
      error: { ...payload, requestId },
    };

    // Side effects: log + Sentry capture
    if (status >= 500) {
      this.logger.error(
        { code: payload.code, requestId, err: this.stack(exception) },
        payload.message,
      );
    } else {
      this.logger.warn(
        { code: payload.code, requestId },
        payload.message,
      );
    }
    captureFromFilter(exception, {
      requestId,
      code: payload.code,
      statusCode: status,
    });

    response.status(status).send(responseBody);
  }

  private normalize(exception: unknown): {
    status: number;
    payload: ErrorPayload;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        payload: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : (raw as { message?: string | string[] }).message
            ? Array.isArray((raw as { message: string[] }).message)
              ? (raw as { message: string[] }).message.join('; ')
              : ((raw as { message: string }).message)
            : exception.message;
      return {
        status,
        payload: {
          code: HTTP_STATUS_TO_CODE[status] ?? 'HTTP_ERROR',
          message,
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const map = PRISMA_CODE_MAP[exception.code];
      if (map) {
        return {
          status: map.status,
          payload: { code: map.code, message: 'Resource error' },
        };
      }
      return {
        status: 500,
        payload: { code: 'DATABASE_ERROR', message: 'Database error' },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    };
  }

  private stack(exception: unknown): string | undefined {
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'stack' in exception &&
      typeof (exception as { stack: unknown }).stack === 'string'
    ) {
      return (exception as { stack: string }).stack;
    }
    return undefined;
  }
}
