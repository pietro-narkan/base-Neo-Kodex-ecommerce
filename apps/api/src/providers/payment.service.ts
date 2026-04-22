import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

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
  paymentUrl?: string;
  instructions?: string;
}

export interface PaymentVerifyResult {
  status: 'paid' | 'pending' | 'failed' | 'cancelled';
  externalReference?: string;
}

export interface PaymentProvider {
  readonly name: string;
  init(params: PaymentInitParams): Promise<PaymentInitResult>;
  verify(reference: string): Promise<PaymentVerifyResult>;
  refund(reference: string, amount?: number): Promise<void>;
}

// ============================================================
// Implementación default: ManualPaymentProvider (transferencia)
// Listo para producción real. El admin marca la orden como PAID
// después de verificar la transferencia en su banco.
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
    // La verificación la hace el admin manualmente cambiando el status.
    return { status: 'pending' };
  }

  async refund(reference: string, _amount?: number): Promise<void> {
    this.logger.log(`Manual refund ${reference} (offline, el admin ejecuta la reversa bancaria)`);
  }
}

// ============================================================
// Service (lo que NestJS inyecta — selecciona impl según env var)
// ============================================================

@Injectable()
export class PaymentService {
  private readonly provider: PaymentProvider;
  private readonly logger = new Logger(PaymentService.name);

  constructor(config: ConfigService, prisma: PrismaService) {
    const name = config.get<string>('PAYMENT_PROVIDER') ?? 'manual';
    switch (name) {
      case 'manual':
        this.provider = new ManualPaymentProvider(prisma);
        break;
      // case 'webpay': this.provider = new WebpayProvider(config); break;
      // case 'flow': this.provider = new FlowProvider(config); break;
      default:
        throw new Error(`PAYMENT_PROVIDER desconocido: ${name}`);
    }
    this.logger.log(`Payment provider activo: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  init(params: PaymentInitParams): Promise<PaymentInitResult> {
    return this.provider.init(params);
  }

  verify(reference: string): Promise<PaymentVerifyResult> {
    return this.provider.verify(reference);
  }

  refund(reference: string, amount?: number): Promise<void> {
    return this.provider.refund(reference, amount);
  }
}
