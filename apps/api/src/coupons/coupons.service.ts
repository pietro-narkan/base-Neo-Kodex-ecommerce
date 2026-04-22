import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Coupon, CouponType } from '@prisma/client';

import type { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateCouponDto,
  UpdateCouponDto,
} from './dto/coupons.dto';

export interface CouponValidationResult {
  coupon: Coupon;
  discountAmount: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count(),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!coupon) {
      throw new NotFoundException('Cupón no encontrado');
    }
    return coupon;
  }

  async getById(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Cupón no encontrado');
    }
    return coupon;
  }

  async create(dto: CreateCouponDto) {
    const code = dto.code.toUpperCase().trim();
    const exists = await this.prisma.coupon.findUnique({ where: { code } });
    if (exists) {
      throw new ConflictException('Código ya existe');
    }
    if (dto.type === 'PERCENTAGE' && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException('Porcentaje debe ser entre 1 y 100');
    }

    return this.prisma.coupon.create({
      data: {
        code,
        type: dto.type as CouponType,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount,
        maxUses: dto.maxUses,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.getById(id);
    if (
      dto.type === 'PERCENTAGE' &&
      dto.value !== undefined &&
      (dto.value < 1 || dto.value > 100)
    ) {
      throw new BadRequestException('Porcentaje debe ser entre 1 y 100');
    }
    return this.prisma.coupon.update({
      where: { id },
      data: {
        type: dto.type as CouponType | undefined,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount,
        maxUses: dto.maxUses,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.coupon.delete({ where: { id } });
    return { ok: true };
  }

  async validateAndCalculate(
    code: string,
    subtotalGross: number,
  ): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!coupon) {
      throw new BadRequestException('Cupón inválido');
    }
    if (!coupon.active) {
      throw new BadRequestException('Cupón inactivo');
    }
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      throw new BadRequestException('Cupón aún no válido');
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      throw new BadRequestException('Cupón expirado');
    }
    if (coupon.maxUses !== null && coupon.maxUses !== undefined) {
      if (coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestException('Cupón agotado');
      }
    }
    if (
      coupon.minOrderAmount !== null &&
      coupon.minOrderAmount !== undefined &&
      subtotalGross < coupon.minOrderAmount
    ) {
      throw new BadRequestException(
        `El subtotal debe ser al menos ${coupon.minOrderAmount}`,
      );
    }

    let discountAmount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discountAmount = Math.floor((subtotalGross * coupon.value) / 100);
    } else {
      discountAmount = Math.min(coupon.value, subtotalGross);
    }
    return { coupon, discountAmount };
  }

  async incrementUse(couponId: string): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
