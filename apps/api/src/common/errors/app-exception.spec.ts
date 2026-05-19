import { describe, it, expect } from 'vitest';
import { AppException } from './app-exception';

describe('AppException', () => {
  it('exposes code, message, status, details on the response', () => {
    const exc = new AppException('COUPON_EXPIRED', 'Cupón vencido', 400, {
      code: 'BIENVENIDA10',
    });
    expect(exc.code).toBe('COUPON_EXPIRED');
    expect(exc.message).toBe('Cupón vencido');
    expect(exc.getStatus()).toBe(400);
    expect(exc.details).toEqual({ code: 'BIENVENIDA10' });
    expect(exc.getResponse()).toMatchObject({
      code: 'COUPON_EXPIRED',
      message: 'Cupón vencido',
      details: { code: 'BIENVENIDA10' },
    });
  });

  it('allows omitting details', () => {
    const exc = new AppException('AUTH_INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    expect(exc.details).toBeUndefined();
    expect(exc.getResponse()).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Credenciales inválidas',
    });
  });
});
