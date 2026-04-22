import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ============================================================
// Interface
// ============================================================

export type DocumentTypeLiteral = 'BOLETA' | 'FACTURA';

export interface DteOrderItem {
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  priceNet: number;
  priceGross: number;
}

export interface DteEmitParams {
  orderId: string;
  orderNumber: string;
  documentType: DocumentTypeLiteral;
  email: string;
  firstName: string;
  lastName: string;
  rut?: string | null;
  subtotalNet: number;
  taxAmount: number;
  total: number;
  items: DteOrderItem[];
}

export interface DteEmitResult {
  folio: string;
  number: string;
  pdfUrl?: string;
  xmlUrl?: string;
}

export interface DteProvider {
  readonly name: string;
  emit(params: DteEmitParams): Promise<DteEmitResult>;
}

// ============================================================
// Implementación default: MockDteProvider
// NO EMITE NADA REAL — solo registra en logs y devuelve folios fake.
// En producción legal chilena se DEBE reemplazar por OpenFactura / Haulmer / LibreDTE.
// ============================================================

class MockDteProvider implements DteProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockDteProvider');

  async emit(params: DteEmitParams): Promise<DteEmitResult> {
    this.logger.warn(
      `[DTE MOCK] ${params.documentType} para orden ${params.orderNumber}, total ${params.total} CLP. ` +
        'INTEGRAR CON PROVEEDOR SII REAL ANTES DE VENDER LEGALMENTE.',
    );
    const folio = `MOCK-${Date.now()}`;
    const prefix = params.documentType === 'BOLETA' ? 'B' : 'F';
    return {
      folio,
      number: `${prefix}-${folio}`,
    };
  }
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class DteService {
  private readonly provider: DteProvider;
  private readonly logger = new Logger(DteService.name);

  constructor(config: ConfigService) {
    const name = config.get<string>('DTE_PROVIDER') ?? 'mock';
    switch (name) {
      case 'mock':
        this.provider = new MockDteProvider();
        break;
      // case 'openfactura': this.provider = new OpenFacturaProvider(config); break;
      // case 'haulmer': this.provider = new HaulmerProvider(config); break;
      default:
        throw new Error(`DTE_PROVIDER desconocido: ${name}`);
    }
    this.logger.log(`DTE provider activo: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Emite el DTE. Retorna null en caso de error — el caller
   * decide qué hacer (loguea y continúa, o reintenta).
   */
  async emit(params: DteEmitParams): Promise<DteEmitResult | null> {
    try {
      return await this.provider.emit(params);
    } catch (err) {
      this.logger.error(
        `DTE emit falló (${this.provider.name}) orden ${params.orderNumber}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
