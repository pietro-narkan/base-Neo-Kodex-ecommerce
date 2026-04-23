import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService, type ProviderId } from '../providers/payment.service';
import {
  WEBPAY_SETTING_KEY,
  WebpayProvider,
  defaultWebpayConfig,
  isWebpayConfig,
  type WebpayConfig,
} from '../providers/webpay.provider';

/**
 * Admin-facing view of payment methods.
 *
 * Hoy hay **dos** providers operativos — manual y webpay. El provider activo
 * se elige desde la UI (se persiste en Setting "payment.active_provider"), con
 * fallback al env var PAYMENT_PROVIDER para ambientes viejos.
 */

export interface WebpayAdminView {
  environment: 'integration' | 'production';
  commerceCode: string;
  /** Nunca devolvemos la API key entera — solo si está seteada. */
  apiKeyConfigured: boolean;
}

export interface PaymentMethodView {
  id: ProviderId;
  name: string;
  description: string;
  /** true = este provider procesa los checkouts hoy */
  active: boolean;
  /** true = tiene config mínima para funcionar */
  configured: boolean;
  /** true = implementación real en el codebase */
  available: boolean;
  /** Config visible al admin (nunca secretos completos) */
  config?: {
    bankDetails?: string;
    webpay?: WebpayAdminView;
  };
}

const BANK_DETAILS_KEY = 'store.bank_details';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payment: PaymentService,
    private readonly webpay: WebpayProvider,
  ) {}

  async listMethods(): Promise<{
    activeProvider: ProviderId;
    methods: PaymentMethodView[];
  }> {
    const active = await this.payment.getActiveProviderId();

    const bankDetailsRow = await this.prisma.setting.findUnique({
      where: { key: BANK_DETAILS_KEY },
    });
    const bankDetails =
      typeof bankDetailsRow?.value === 'string' ? bankDetailsRow.value : '';

    const webpayConfig = await this.webpay.loadConfig();
    const webpayView: WebpayAdminView = {
      environment: webpayConfig.environment,
      commerceCode: webpayConfig.commerceCode,
      apiKeyConfigured: webpayConfig.apiKey.trim().length > 0,
    };

    // Webpay cuenta como "configurado" si está en integration (hay fallback
    // a credenciales públicas) o si tiene commerceCode + apiKey en production.
    const webpayConfigured =
      webpayConfig.environment === 'integration'
        ? true
        : webpayConfig.commerceCode.trim().length > 0 &&
          webpayConfig.apiKey.trim().length > 0;

    const methods: PaymentMethodView[] = [
      {
        id: 'manual',
        name: 'Transferencia bancaria',
        description:
          'El cliente ve los datos de la cuenta en el checkout y hace la transferencia manualmente. Vos confirmás el pago desde el detalle de la orden.',
        active: active === 'manual',
        configured: bankDetails.trim().length > 0,
        available: true,
        config: { bankDetails },
      },
      {
        id: 'webpay',
        name: 'Webpay Plus (Transbank)',
        description:
          'Pasarela oficial de Transbank para tarjetas chilenas. En integration podés probar con las credenciales públicas de Transbank; en production necesitás el contrato y tu commerce code + API key reales.',
        active: active === 'webpay',
        configured: webpayConfigured,
        available: true,
        config: { webpay: webpayView },
      },
      {
        id: 'mercadopago',
        name: 'Mercado Pago',
        description:
          'Acepta tarjetas + transferencias + billeteras LATAM. Setup vía API keys de Mercado Pago Checkout Pro. Integración pendiente.',
        active: active === 'mercadopago',
        configured: false,
        available: false,
      },
      {
        id: 'flow',
        name: 'Flow',
        description:
          'Alternativa a Webpay, alta aceptación en Chile. Integración pendiente.',
        active: active === 'flow',
        configured: false,
        available: false,
      },
    ];
    return { activeProvider: active, methods };
  }

  async updateBankDetails(
    value: string,
    actor: { id: string; email: string },
  ) {
    const before = await this.prisma.setting.findUnique({
      where: { key: BANK_DETAILS_KEY },
    });
    const row = await this.prisma.setting.upsert({
      where: { key: BANK_DETAILS_KEY },
      update: { value },
      create: { key: BANK_DETAILS_KEY, value },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: before ? 'update' : 'create',
      entityType: 'paymentMethod',
      entityId: 'manual',
      before: before ? { bankDetails: before.value } : undefined,
      after: { bankDetails: row.value },
    });
    return { ok: true };
  }

  async updateWebpayConfig(
    input: {
      environment: 'integration' | 'production';
      commerceCode: string;
      // apiKey opcional — si no viene, mantenemos el guardado. Permite que el
      // admin edite commerceCode/environment sin tener que re-pegar la apiKey.
      apiKey?: string;
    },
    actor: { id: string; email: string },
  ) {
    const before = await this.prisma.setting.findUnique({
      where: { key: WEBPAY_SETTING_KEY },
    });
    const beforeCfg: WebpayConfig =
      before && isWebpayConfig(before.value) ? before.value : defaultWebpayConfig();

    const merged: WebpayConfig = {
      environment: input.environment,
      commerceCode: input.commerceCode.trim(),
      apiKey:
        input.apiKey !== undefined ? input.apiKey.trim() : beforeCfg.apiKey,
    };

    const value = { ...merged } as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key: WEBPAY_SETTING_KEY },
      update: { value },
      create: { key: WEBPAY_SETTING_KEY, value },
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: before ? 'update' : 'create',
      entityType: 'paymentMethod',
      entityId: 'webpay',
      before: before
        ? {
            environment: beforeCfg.environment,
            commerceCode: beforeCfg.commerceCode,
            apiKeySet: beforeCfg.apiKey.length > 0,
          }
        : undefined,
      after: {
        environment: merged.environment,
        commerceCode: merged.commerceCode,
        apiKeySet: merged.apiKey.length > 0,
      },
    });
    return { ok: true };
  }

  async setActiveProvider(
    id: ProviderId,
    actor: { id: string; email: string },
  ) {
    await this.payment.setActiveProvider(id, actor);
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      entityType: 'paymentMethod',
      entityId: 'active',
      after: { activeProvider: id },
    });
    return { activeProvider: id };
  }
}
