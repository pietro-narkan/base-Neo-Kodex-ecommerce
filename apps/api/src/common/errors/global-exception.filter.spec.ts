import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, it, expect } from 'vitest';

import { AppException } from './app-exception';
import { GlobalHttpExceptionFilter } from './global-exception.filter';
import { withRequestContext } from '../request-context';

describe('GlobalHttpExceptionFilter', () => {
  const filter = new GlobalHttpExceptionFilter();

  it('normalizes AppException preserving code/details', () => {
    let statusCode = 0;
    let payload: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: unknown) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'req-1', method: 'POST', url: '/api/x' }),
      }),
    };
    withRequestContext({ requestId: 'req-1' }, () => {
      filter.catch(
        new AppException('COUPON_EXPIRED', 'Cupón vencido', 400, { code: 'X' }),
        host as never,
      );
    });
    expect(statusCode).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'COUPON_EXPIRED',
        message: 'Cupón vencido',
        details: { code: 'X' },
        requestId: 'req-1',
      },
    });
  });

  it('maps HttpException (BadRequest) to BAD_REQUEST generic code', () => {
    let statusCode = 0;
    let payload: { error: { code: string; message: string } } | undefined;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: { error: { code: string; message: string } }) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'r', method: 'POST', url: '/api/x' }),
      }),
    };
    filter.catch(new BadRequestException('Algo'), host as never);
    expect(statusCode).toBe(400);
    expect(payload?.error.code).toBe('BAD_REQUEST');
    expect(payload?.error.message).toBe('Algo');
  });

  it('maps PrismaClientKnownRequestError P2025 to RESOURCE_NOT_FOUND (404)', () => {
    let statusCode = 0;
    let payload: { error: { code: string } } | undefined;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: { error: { code: string } }) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'r', method: 'POST', url: '/api/x' }),
      }),
    };
    const err = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0',
    });
    filter.catch(err, host as never);
    expect(statusCode).toBe(404);
    expect(payload?.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('maps generic Error to INTERNAL_ERROR with 500', () => {
    let statusCode = 0;
    let payload: { error: { code: string; message: string } } | undefined;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: { error: { code: string; message: string } }) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'r', method: 'GET', url: '/api/x' }),
      }),
    };
    filter.catch(new Error('boom'), host as never);
    expect(statusCode).toBe(500);
    expect(payload?.error.code).toBe('INTERNAL_ERROR');
    expect(payload?.error.message).toBe('Internal server error');
  });
});
