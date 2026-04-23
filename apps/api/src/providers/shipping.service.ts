import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// Interface
// ============================================================

export interface ShippingQuote {
  name: string;
  cost: number;
  etaDays?: number;
  code?: string;
}

export interface ShippingQuoteParams {
  address: {
    region: string;
    city: string;
    country?: string;
    postalCode?: string;
  };
  items: Array<{
    weightGrams?: number | null;
    quantity: number;
  }>;
  subtotalGross: number;
}

export interface ShippingProvider {
  readonly name: string;
  quote(params: ShippingQuoteParams): Promise<ShippingQuote[]>;
}

// ============================================================
// Implementaciones default
// ============================================================

/**
 * Shipping por región (si hay rates configurados en ShippingRate) con
 * fallback a tarifa plana vía Setting. Producción-ready.
 *
 * Prioridad de resolución:
 *   1. Si existe un ShippingRate activo matcheando el region de la dirección,
 *      usa su rate + freeThreshold propio.
 *   2. Si no, cae a `store.shipping_flat_rate` + `store.shipping_free_threshold`.
 */
class FlatRateShippingProvider implements ShippingProvider {
  readonly name = 'flat';

  constructor(private readonly prisma: PrismaService) {}

  async quote(params: ShippingQuoteParams): Promise<ShippingQuote[]> {
    // Region-specific rate takes precedence.
    if (params.address.region) {
      const regional = await this.prisma.shippingRate.findFirst({
        where: { region: params.address.region, active: true },
      });
      if (regional) {
        const freeByThreshold =
          regional.freeThreshold !== null &&
          regional.freeThreshold !== undefined &&
          params.subtotalGross >= regional.freeThreshold;
        const cost = freeByThreshold ? 0 : regional.rate;
        return [
          {
            name:
              cost === 0 ? 'Envío gratis' : `Envío a ${regional.region}`,
            cost,
            etaDays: regional.etaDays ?? undefined,
            code: 'regional',
          },
        ];
      }
    }

    // Fallback: flat rate via Setting
    const [rateSetting, thresholdSetting] = await Promise.all([
      this.prisma.setting.findUnique({
        where: { key: 'store.shipping_flat_rate' },
      }),
      this.prisma.setting.findUnique({
        where: { key: 'store.shipping_free_threshold' },
      }),
    ]);

    const baseRate =
      typeof rateSetting?.value === 'number'
        ? (rateSetting.value as number)
        : 3990;
    const threshold =
      typeof thresholdSetting?.value === 'number'
        ? (thresholdSetting.value as number)
        : null;

    const free = threshold !== null && params.subtotalGross >= threshold;
    return [
      {
        name: free ? 'Envío gratis' : 'Envío tarifa plana',
        cost: free ? 0 : baseRate,
        etaDays: 5,
        code: 'flat',
      },
    ];
  }
}

/** Envío siempre gratis (ideal para servicios digitales o retiros en tienda). */
class FreeShippingProvider implements ShippingProvider {
  readonly name = 'free';

  async quote(_params: ShippingQuoteParams): Promise<ShippingQuote[]> {
    return [{ name: 'Envío gratis', cost: 0, code: 'free', etaDays: 3 }];
  }
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class ShippingService {
  private readonly provider: ShippingProvider;
  private readonly logger = new Logger(ShippingService.name);

  constructor(config: ConfigService, prisma: PrismaService) {
    const name = config.get<string>('SHIPPING_PROVIDER') ?? 'flat';
    switch (name) {
      case 'flat':
        this.provider = new FlatRateShippingProvider(prisma);
        break;
      case 'free':
        this.provider = new FreeShippingProvider();
        break;
      // case 'chilexpress': this.provider = new ChilexpressProvider(config); break;
      // case 'starken': this.provider = new StarkenProvider(config); break;
      default:
        throw new Error(`SHIPPING_PROVIDER desconocido: ${name}`);
    }
    this.logger.log(`Shipping provider activo: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  quote(params: ShippingQuoteParams): Promise<ShippingQuote[]> {
    return this.provider.quote(params);
  }
}
