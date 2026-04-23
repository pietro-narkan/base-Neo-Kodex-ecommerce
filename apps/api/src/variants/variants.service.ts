import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateVariantDto,
  UpdateVariantDto,
} from './dto/variants.dto';

const DEFAULT_TAX_RATE_BP = 1900;
const TAX_SETTING_KEY = 'store.tax_rate_bp';

function netToGross(net: number, taxRateBp: number): number {
  return Math.round(net * (1 + taxRateBp / 10000));
}

const variantInclude = {
  attributes: {
    include: {
      attributeValue: { include: { attribute: true } },
    },
  },
  media: { orderBy: { position: 'asc' as const } },
} as const;

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getTaxRateBp(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: TAX_SETTING_KEY },
    });
    const value = setting?.value;
    return typeof value === 'number' ? value : DEFAULT_TAX_RATE_BP;
  }

  private async ensureAttributeValuesExist(ids: string[]) {
    if (ids.length === 0) return;
    const found = await this.prisma.attributeValue.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Algún attributeValueId no existe');
    }
  }

  async create(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const existingSku = await this.prisma.variant.findUnique({
      where: { sku: dto.sku },
    });
    if (existingSku) {
      throw new ConflictException('SKU ya en uso');
    }

    if (dto.attributeValueIds?.length) {
      await this.ensureAttributeValuesExist(dto.attributeValueIds);
    }

    const taxRateBp = await this.getTaxRateBp();
    const priceGross = netToGross(dto.priceNet, taxRateBp);
    const salePriceGross =
      dto.salePriceNet !== undefined
        ? netToGross(dto.salePriceNet, taxRateBp)
        : null;

    return this.prisma.variant.create({
      data: {
        productId,
        sku: dto.sku,
        name: dto.name,
        priceNet: dto.priceNet,
        priceGross,
        compareAtPrice: dto.compareAtPrice,
        salePriceNet: dto.salePriceNet ?? null,
        salePriceGross,
        saleStartAt: dto.saleStartAt ? new Date(dto.saleStartAt) : null,
        saleEndAt: dto.saleEndAt ? new Date(dto.saleEndAt) : null,
        stock: dto.stock ?? 0,
        weightGrams: dto.weightGrams,
        lengthCm: dto.lengthCm,
        widthCm: dto.widthCm,
        heightCm: dto.heightCm,
        active: dto.active ?? true,
        ...(dto.attributeValueIds?.length
          ? {
              attributes: {
                create: dto.attributeValueIds.map((avid) => ({
                  attributeValueId: avid,
                })),
              },
            }
          : {}),
      },
      include: variantInclude,
    });
  }

  async getById(id: string) {
    const variant = await this.prisma.variant.findUnique({
      where: { id },
      include: variantInclude,
    });
    if (!variant) {
      throw new NotFoundException('Variante no encontrada');
    }
    return variant;
  }

  async update(id: string, dto: UpdateVariantDto) {
    const current = await this.getById(id);

    if (dto.sku !== undefined && dto.sku !== current.sku) {
      const existingSku = await this.prisma.variant.findUnique({
        where: { sku: dto.sku },
      });
      if (existingSku) {
        throw new ConflictException('SKU ya en uso');
      }
    }

    if (dto.attributeValueIds !== undefined) {
      await this.ensureAttributeValuesExist(dto.attributeValueIds);
    }

    let priceGross: number | undefined;
    let salePriceGross: number | null | undefined;
    if (dto.priceNet !== undefined || dto.salePriceNet !== undefined) {
      const taxRateBp = await this.getTaxRateBp();
      if (dto.priceNet !== undefined) {
        priceGross = netToGross(dto.priceNet, taxRateBp);
      }
      if (dto.salePriceNet !== undefined) {
        salePriceGross =
          dto.salePriceNet === null
            ? null
            : netToGross(dto.salePriceNet, taxRateBp);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.attributeValueIds !== undefined) {
        await tx.variantAttribute.deleteMany({ where: { variantId: id } });
        if (dto.attributeValueIds.length > 0) {
          await tx.variantAttribute.createMany({
            data: dto.attributeValueIds.map((avid) => ({
              variantId: id,
              attributeValueId: avid,
            })),
          });
        }
      }

      return tx.variant.update({
        where: { id },
        data: {
          sku: dto.sku,
          name: dto.name,
          priceNet: dto.priceNet,
          priceGross,
          compareAtPrice: dto.compareAtPrice,
          salePriceNet: dto.salePriceNet,
          salePriceGross,
          saleStartAt: dto.saleStartAt ? new Date(dto.saleStartAt) : dto.saleStartAt === null ? null : undefined,
          saleEndAt: dto.saleEndAt ? new Date(dto.saleEndAt) : dto.saleEndAt === null ? null : undefined,
          stock: dto.stock,
          weightGrams: dto.weightGrams,
          lengthCm: dto.lengthCm,
          widthCm: dto.widthCm,
          heightCm: dto.heightCm,
          active: dto.active,
        },
        include: variantInclude,
      });
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.variant.delete({ where: { id } });
    return { ok: true };
  }
}
