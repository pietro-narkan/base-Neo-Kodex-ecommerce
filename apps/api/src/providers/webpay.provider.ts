import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Environment,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Options,
  WebpayPlus,
} from 'transbank-sdk';

import { PrismaService } from '../prisma/prisma.service';
import type {
  PaymentCommitResult,
  PaymentInitParams,
  PaymentInitResult,
  PaymentProvider,
  PaymentVerifyResult,
} from './payment.service';

// ============================================================
// Config stored in Setting under key "payment.webpay"
// ============================================================

export const WEBPAY_SETTING_KEY = 'payment.webpay';

export interface WebpayConfig {
  environment: 'integration' | 'production';
  commerceCode: string;
  apiKey: string;
}

export function isWebpayConfig(value: unknown): value is WebpayConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.environment === 'integration' || v.environment === 'production') &&
    typeof v.commerceCode === 'string' &&
    typeof v.apiKey === 'string'
  );
}

export function defaultWebpayConfig(): WebpayConfig {
  return { environment: 'integration', commerceCode: '', apiKey: '' };
}

// ============================================================
// Provider
// ============================================================

/**
 * Webpay Plus (Transbank Chile) — ver https://www.transbankdevelopers.cl/referencia/webpay
 *
 * Config en DB (Setting "payment.webpay") con environment + commerceCode + apiKey.
 * Fallback automático a las **credenciales públicas de integración** de Transbank
 * cuando environment=integration y los campos están vacíos — así el admin puede
 * testear sin tener contrato real.
 *
 * Flujo:
 *   1. init() → tx.create() devuelve { token, url }. Lo envolvemos en
 *      `redirect: { url, method: POST, params: { token_ws } }` para que el
 *      storefront auto-submitée un form al dominio de Transbank.
 *   2. Transbank redirige al returnUrl (nuestro /api/payments/webpay/return).
 *   3. commit() → tx.commit() confirma y devuelve el resultado final.
 *
 * Webpay Plus no tiene webhooks server-to-server — todo pasa por el browser
 * del usuario. Si el cliente cierra el tab antes de volver al returnUrl nunca
 * nos enteramos; por eso la reconciliación manual vía verify() sigue estando.
 */
@Injectable()
export class WebpayProvider implements PaymentProvider {
  readonly name = 'webpay';
  private readonly logger = new Logger('WebpayProvider');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // -------- Public API --------

  async init(params: PaymentInitParams): Promise<PaymentInitResult> {
    const { tx, environment } = await this.loadTransaction();
    const buyOrder = this.buildBuyOrder(params.orderNumber);
    const sessionId = params.orderId.substring(0, 60);
    const amount = Math.round(params.total);
    const returnUrl = this.buildReturnUrl();

    try {
      const resp = await tx.create(buyOrder, sessionId, amount, returnUrl);
      this.logger.log(
        `create ok orden=${params.orderNumber} token=${resp.token.substring(0, 8)}… env=${environment}`,
      );
      return {
        reference: resp.token,
        redirect: {
          url: resp.url,
          method: 'POST',
          params: { token_ws: resp.token },
        },
      };
    } catch (err) {
      this.logger.error(
        `create falló orden=${params.orderNumber}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async commit(tokenWs: string): Promise<PaymentCommitResult> {
    const { tx } = await this.loadTransaction();
    const resp = await tx.commit(tokenWs);
    const authorized =
      resp.status === 'AUTHORIZED' && resp.response_code === 0;
    this.logger.log(
      `commit ${authorized ? 'APROBADA' : 'RECHAZADA'} buyOrder=${resp.buy_order} code=${resp.response_code} status=${resp.status}`,
    );
    return {
      status: authorized ? 'paid' : 'failed',
      externalReference: resp.authorization_code,
      amount: resp.amount,
      buyOrder: resp.buy_order,
      raw: resp,
    };
  }

  async verify(reference: string): Promise<PaymentVerifyResult> {
    try {
      const { tx } = await this.loadTransaction();
      const resp = await tx.status(reference);
      if (resp.status === 'AUTHORIZED' && resp.response_code === 0) {
        return {
          status: 'paid',
          externalReference: resp.authorization_code,
        };
      }
      if (resp.status === 'INITIALIZED') {
        return { status: 'pending' };
      }
      return { status: 'failed' };
    } catch (err) {
      this.logger.warn(
        `verify falló reference=${reference}: ${(err as Error).message}`,
      );
      return { status: 'pending' };
    }
  }

  async refund(reference: string, amount?: number): Promise<void> {
    if (amount == null || amount <= 0) {
      throw new Error('Webpay refund requiere un monto > 0');
    }
    const { tx } = await this.loadTransaction();
    const resp = await tx.refund(reference, Math.round(amount));
    this.logger.log(
      `refund ok reference=${reference} type=${resp.type} monto=${amount}`,
    );
  }

  // -------- Helpers --------

  /** Devuelve la instancia de Transaction lista para usar + el environment activo. */
  private async loadTransaction(): Promise<{
    tx: InstanceType<typeof WebpayPlus.Transaction>;
    environment: 'integration' | 'production';
  }> {
    const cfg = await this.loadConfig();
    const env =
      cfg.environment === 'production'
        ? Environment.Production
        : Environment.Integration;

    // Fallback a credenciales públicas de integración si no están seteadas.
    const commerceCode =
      cfg.commerceCode.trim() ||
      (cfg.environment === 'integration'
        ? IntegrationCommerceCodes.WEBPAY_PLUS
        : '');
    const apiKey =
      cfg.apiKey.trim() ||
      (cfg.environment === 'integration' ? IntegrationApiKeys.WEBPAY : '');

    if (!commerceCode || !apiKey) {
      throw new Error(
        'Webpay no está configurado — falta commerceCode / apiKey para environment=' +
          cfg.environment,
      );
    }

    const tx = new WebpayPlus.Transaction(
      new Options(commerceCode, apiKey, env),
    );
    return { tx, environment: cfg.environment };
  }

  async loadConfig(): Promise<WebpayConfig> {
    const row = await this.prisma.setting.findUnique({
      where: { key: WEBPAY_SETTING_KEY },
    });
    if (row && isWebpayConfig(row.value)) return row.value;
    return defaultWebpayConfig();
  }

  /**
   * Webpay exige `buy_order` único por comercio de por vida + máx 26 chars.
   * Reintentar con el mismo orderNumber pelaría contra Transbank, así que
   * sufijamos con timestamp base36 (≤ 8 chars) para garantizar unicidad sin
   * romper el trazado al número original.
   */
  private buildBuyOrder(orderNumber: string): string {
    const suffix = Date.now().toString(36).slice(-6);
    const base = orderNumber.substring(0, 26 - suffix.length - 1);
    return `${base}-${suffix}`;
  }

  private buildReturnUrl(): string {
    const base =
      this.config.get<string>('API_PUBLIC_URL') ??
      this.config.get<string>('PUBLIC_URL') ??
      'http://localhost:3001';
    return `${base.replace(/\/$/, '')}/api/payments/webpay/return`;
  }
}
