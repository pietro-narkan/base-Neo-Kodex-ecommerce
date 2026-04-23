import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin-facing view of payment methods. Currently only one method is active
 * at a time (controlled by env var PAYMENT_PROVIDER), but the UI surface is
 * ready for multi-method once we integrate real gateways.
 */

type ProviderId = 'manual' | 'webpay' | 'mercadopago' | 'flow';

export interface PaymentMethodView {
  id: ProviderId;
  name: string;
  description: string;
  /** true = this provider is the one that actually processes checkouts today */
  active: boolean;
  /** true = has enough config saved to work (for manual: bank_details set) */
  configured: boolean;
  /** true = the provider is a working integration in the codebase */
  available: boolean;
  /** Optional config values to show in the UI (never includes secrets) */
  config?: Record<string, unknown>;
}

const BANK_DETAILS_KEY = 'store.bank_details';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listMethods(): Promise<{
    activeProvider: ProviderId;
    methods: PaymentMethodView[];
  }> {
    const active = (this.config.get<string>('PAYMENT_PROVIDER') ??
      'manual') as ProviderId;

    const bankDetailsRow = await this.prisma.setting.findUnique({
      where: { key: BANK_DETAILS_KEY },
    });
    const bankDetails =
      typeof bankDetailsRow?.value === 'string' ? bankDetailsRow.value : '';

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
          'Pasarela oficial de Transbank para tarjetas chilenas. Requiere contrato con Transbank, certificación y variables TBK_* de producción. Integración pendiente.',
        active: active === 'webpay',
        configured: false,
        available: false,
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
}
