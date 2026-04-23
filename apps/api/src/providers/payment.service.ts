import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { WebpayProvider } from './webpay.provider';

// ============================================================
// Interface (contrato que cualquier pasarela debe cumplir)
// ============================================================

export interface PaymentInitParams {
  orderId: string;
  orderNumber: string;
  total: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PaymentInitResult {
  reference: string;
  /** URL directa a un checkout externo (fallback simple). */
  paymentUrl?: string;
  /** Texto con instrucciones al cliente (usado por el provider manual). */
  instructions?: string;
  /**
   * Redirección del navegador a la pasarela. El storefront arma un form con
   * estos params y lo submitea automáticamente.
   */
  redirect?: {
    url: string;
    method: 'POST' | 'GET';
    params: Record<string, string>;
  };
}

export interface PaymentVerifyResult {
  status: 'paid' | 'pending' | 'failed' | 'cancelled';
  externalReference?: string;
}

export interface PaymentCommitResult {
  status: 'paid' | 'failed' | 'cancelled';
  externalReference?: string;
  amount?: number;
  /** Algunos proveedores (Webpay) devuelven el buyOrder — útil para matchear la orden. */
  buyOrder?: string;
  /** Respuesta cruda del proveedor, para auditoría. */
  raw?: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  init(params: PaymentInitParams): Promise<PaymentInitResult>;
  verify(reference: string): Promise<PaymentVerifyResult>;
  refund(reference: string, amount?: number): Promise<void>;
  /** Solo pasarelas tipo redirect necesitan commit (Webpay). */
  commit?(token: string): Promise<PaymentCommitResult>;
}

export type ProviderId = 'manual' | 'webpay' | 'mercadopago' | 'flow';

// ============================================================
// ManualPaymentProvider — transferencia bancaria
// ============================================================

class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';
  private readonly logger = new Logger('ManualPaymentProvider');

  constructor(private readonly prisma: PrismaService) {}

  async init(params: PaymentInitParams): Promise<PaymentInitResult> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'store.bank_details' },
    });
    const bankDetails =
      typeof setting?.value === 'string'
        ? setting.value
        : 'Datos bancarios aún no configurados. Ir a Admin → Settings.';

    const instructions = [
      `Transferir ${params.total.toLocaleString('es-CL')} CLP a:`,
      '',
      bankDetails,
      '',
      `Asunto / referencia: ${params.orderNumber}`,
    ].join('\n');

    this.logger.log(
      `Manual payment init para ${params.orderNumber} (total ${params.total})`,
    );
    return {
      reference: `MANUAL-${params.orderNumber}`,
      instructions,
    };
  }

  async verify(_reference: string): Promise<PaymentVerifyResult> {
    return { status: 'pending' };
  }

  async refund(reference: string, _amount?: number): Promise<void> {
    this.logger.log(
      `Manual refund ${reference} (offline, el admin ejecuta la reversa bancaria)`,
    );
  }
}

// ============================================================
// Service — dispatch al provider activo (elegido en DB o env var)
// ============================================================

const ACTIVE_PROVIDER_SETTING_KEY = 'payment.active_provider';

@Injectable()
export class PaymentService {
  private readonly manual: ManualPaymentProvider;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly webpay: WebpayProvider,
  ) {
    this.manual = new ManualPaymentProvider(prisma);
  }

  /**
   * Provider activo — lee el setting payment.active_provider (DB) y cae al
   * env var PAYMENT_PROVIDER como fallback. Permite switchear desde el admin
   * sin reiniciar el API.
   */
  async getActiveProviderId(): Promise<ProviderId> {
    const row = await this.prisma.setting.findUnique({
      where: { key: ACTIVE_PROVIDER_SETTING_KEY },
    });
    const fromDb =
      typeof row?.value === 'string' ? (row.value as ProviderId) : null;
    if (fromDb && this.isKnownProvider(fromDb)) return fromDb;
    const fromEnv = this.config.get<string>('PAYMENT_PROVIDER') ?? 'manual';
    return this.isKnownProvider(fromEnv as ProviderId)
      ? (fromEnv as ProviderId)
      : 'manual';
  }

  /** Resuelve una instancia del provider por id. Solo manual y webpay hoy. */
  getProvider(id: ProviderId): PaymentProvider {
    switch (id) {
      case 'manual':
        return this.manual;
      case 'webpay':
        return this.webpay;
      default:
        throw new Error(`Payment provider no disponible: ${id}`);
    }
  }

  async getActiveProvider(): Promise<PaymentProvider> {
    const id = await this.getActiveProviderId();
    return this.getProvider(id);
  }

  get providerName(): string {
    // Back-compat con callers que lo usan sincrónico; devuelve env fallback.
    return this.config.get<string>('PAYMENT_PROVIDER') ?? 'manual';
  }

  async init(params: PaymentInitParams): Promise<PaymentInitResult> {
    const provider = await this.getActiveProvider();
    return provider.init(params);
  }

  /**
   * Verify — por defecto usa el provider activo. Si pasás `providerId`
   * explícito, usa ese (útil para reconciliar órdenes viejas pagadas con
   * otro proveedor).
   */
  async verify(
    reference: string,
    providerId?: ProviderId,
  ): Promise<PaymentVerifyResult> {
    const provider = providerId
      ? this.getProvider(providerId)
      : await this.getActiveProvider();
    return provider.verify(reference);
  }

  async refund(
    reference: string,
    amount?: number,
    providerId?: ProviderId,
  ): Promise<void> {
    const provider = providerId
      ? this.getProvider(providerId)
      : await this.getActiveProvider();
    return provider.refund(reference, amount);
  }

  async commit(
    token: string,
    providerId: ProviderId = 'webpay',
  ): Promise<PaymentCommitResult> {
    const provider = this.getProvider(providerId);
    if (!provider.commit) {
      throw new NotFoundException(
        `El provider ${providerId} no soporta commit.`,
      );
    }
    return provider.commit(token);
  }

  async setActiveProvider(
    id: ProviderId,
    actor: { id: string; email: string },
  ): Promise<ProviderId> {
    if (!this.isKnownProvider(id)) {
      throw new Error(`Provider desconocido: ${id}`);
    }
    if (id !== 'manual' && id !== 'webpay') {
      throw new Error(`Provider no disponible todavía: ${id}`);
    }
    await this.prisma.setting.upsert({
      where: { key: ACTIVE_PROVIDER_SETTING_KEY },
      update: { value: id },
      create: { key: ACTIVE_PROVIDER_SETTING_KEY, value: id },
    });
    this.logger.log(
      `Provider activo cambiado a "${id}" por ${actor.email}`,
    );
    return id;
  }

  private isKnownProvider(id: string): id is ProviderId {
    return ['manual', 'webpay', 'mercadopago', 'flow'].includes(id);
  }
}
