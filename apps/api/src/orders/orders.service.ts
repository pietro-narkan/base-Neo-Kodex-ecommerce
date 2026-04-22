import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentType, OrderStatus, Prisma } from '@prisma/client';

import { CouponsService } from '../coupons/coupons.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AddressDto, CheckoutDto } from './dto/orders.dto';

const ORDER_COUNTER_KEY = 'order.last_number';

const orderInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  },
  shippingAddress: true,
  billingAddress: true,
  customer: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isGuest: true,
    },
  },
} satisfies Prisma.OrderInclude;

const cartIncludeForCheckout = {
  items: {
    include: {
      variant: {
        include: { product: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
  ) {}

  async checkout(params: {
    dto: CheckoutDto;
    customerId?: string;
    sessionId?: string;
  }) {
    const cart = await this.findCart(params);
    if (cart.items.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Reservar stock atómicamente
      for (const item of cart.items) {
        const result = await tx.variant.updateMany({
          where: { id: item.variantId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          const variant = await tx.variant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          });
          throw new BadRequestException(
            `Stock insuficiente para ${variant?.product.name ?? 'producto'} (SKU ${variant?.sku ?? item.variantId})`,
          );
        }
      }

      // 2. Totales
      const subtotalNet = cart.items.reduce(
        (s, i) => s + i.variant.priceNet * i.quantity,
        0,
      );
      const subtotalGross = cart.items.reduce(
        (s, i) => s + i.variant.priceGross * i.quantity,
        0,
      );
      const taxAmount = subtotalGross - subtotalNet;

      // 3. Cupón (si hay)
      let discountAmount = 0;
      let couponId: string | null = null;
      if (cart.couponCode) {
        try {
          const { coupon, discountAmount: d } =
            await this.coupons.validateAndCalculate(
              cart.couponCode,
              subtotalGross,
            );
          discountAmount = d;
          couponId = coupon.id;
        } catch {
          discountAmount = 0;
        }
      }
      const shippingAmount = 0;
      const total = Math.max(
        0,
        subtotalGross - discountAmount + shippingAmount,
      );

      // 4. Cliente (registrado o guest)
      let customerId = params.customerId;
      if (!customerId) {
        const existing = await tx.customer.findUnique({
          where: { email: params.dto.email },
        });
        if (existing) {
          customerId = existing.id;
          if (existing.isGuest) {
            await tx.customer.update({
              where: { id: existing.id },
              data: {
                firstName: params.dto.firstName,
                lastName: params.dto.lastName,
                phone: params.dto.phone ?? existing.phone,
                rut: params.dto.rut ?? existing.rut,
              },
            });
          }
        } else {
          const created = await tx.customer.create({
            data: {
              email: params.dto.email,
              firstName: params.dto.firstName,
              lastName: params.dto.lastName,
              phone: params.dto.phone,
              rut: params.dto.rut,
              isGuest: true,
            },
          });
          customerId = created.id;
        }
      }

      // 5. Direcciones
      const shippingAddress = await tx.address.create({
        data: {
          customerId,
          ...this.addressData(params.dto.shippingAddress),
        },
      });
      const billingAddress = params.dto.billingAddress
        ? await tx.address.create({
            data: {
              customerId,
              ...this.addressData(params.dto.billingAddress),
            },
          })
        : shippingAddress;

      // 6. Order number
      const orderNumber = await this.nextOrderNumber(tx);

      // 7. Crear order con items (snapshot)
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          email: params.dto.email,
          firstName: params.dto.firstName,
          lastName: params.dto.lastName,
          phone: params.dto.phone,
          rut: params.dto.rut,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          subtotalNet,
          subtotalGross,
          taxAmount,
          shippingAmount,
          discountAmount,
          total,
          couponCode: cart.couponCode,
          shippingAddressId: shippingAddress.id,
          billingAddressId: billingAddress.id,
          documentType: (params.dto.documentType ?? 'NONE') as DocumentType,
          paymentProvider: 'manual',
          notes: params.dto.notes,
          items: {
            create: cart.items.map((i) => ({
              variantId: i.variantId,
              productName: i.variant.product.name,
              variantName: i.variant.name,
              sku: i.variant.sku,
              priceNet: i.variant.priceNet,
              priceGross: i.variant.priceGross,
              taxAmount: i.variant.priceGross - i.variant.priceNet,
              quantity: i.quantity,
              subtotal: i.variant.priceGross * i.quantity,
            })),
          },
        },
        include: orderInclude,
      });

      // 8. Incrementar uso del cupón
      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      // 9. Borrar el carrito
      await tx.cart.delete({ where: { id: cart.id } });

      return order;
    });
  }

  async listMine(
    customerId: string,
    pagination: { page?: number; limit?: number },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = { customerId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMine(customerId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order || order.customerId !== customerId) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }

  async listAdmin(
    pagination: { page?: number; limit?: number },
    filters: { status?: OrderStatus },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.OrderWhereInput = filters.status
      ? { status: filters.status }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getByIdAdmin(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const current = await this.getByIdAdmin(id);
    if (current.status === status) return current;

    return this.prisma.$transaction(async (tx) => {
      const isEndState = status === 'CANCELLED' || status === 'REFUNDED';
      const wasEndState =
        current.status === 'CANCELLED' || current.status === 'REFUNDED';

      if (isEndState && !wasEndState) {
        for (const item of current.items) {
          if (item.variantId) {
            await tx.variant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }
      }
      if (!isEndState && wasEndState) {
        for (const item of current.items) {
          if (item.variantId) {
            const result = await tx.variant.updateMany({
              where: {
                id: item.variantId,
                stock: { gte: item.quantity },
              },
              data: { stock: { decrement: item.quantity } },
            });
            if (result.count === 0) {
              throw new BadRequestException(
                `No se puede reactivar: stock insuficiente para SKU ${item.sku}`,
              );
            }
          }
        }
      }

      let paymentStatus = current.paymentStatus;
      if (status === 'PAID' && current.paymentStatus === 'PENDING') {
        paymentStatus = 'PAID';
      } else if (status === 'REFUNDED') {
        paymentStatus = 'REFUNDED';
      }

      return tx.order.update({
        where: { id },
        data: { status, paymentStatus },
        include: orderInclude,
      });
    });
  }

  // ===== Helpers =====

  private async findCart(params: {
    customerId?: string;
    sessionId?: string;
  }) {
    if (params.customerId) {
      const cart = await this.prisma.cart.findFirst({
        where: { customerId: params.customerId },
        include: cartIncludeForCheckout,
      });
      if (!cart) throw new NotFoundException('No hay carrito activo');
      return cart;
    }
    if (params.sessionId) {
      const cart = await this.prisma.cart.findUnique({
        where: { sessionId: params.sessionId },
        include: cartIncludeForCheckout,
      });
      if (!cart) throw new NotFoundException('No hay carrito activo');
      return cart;
    }
    throw new BadRequestException(
      'Requiere autenticación o header X-Cart-Session',
    );
  }

  private addressData(dto: AddressDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      line1: dto.line1,
      line2: dto.line2,
      city: dto.city,
      region: dto.region,
      postalCode: dto.postalCode,
      country: dto.country ?? 'CL',
    };
  }

  private async nextOrderNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const setting = await tx.setting.findUnique({
      where: { key: ORDER_COUNTER_KEY },
    });
    const last =
      typeof setting?.value === 'number' ? (setting.value as number) : 0;
    const next = last + 1;
    await tx.setting.upsert({
      where: { key: ORDER_COUNTER_KEY },
      create: {
        key: ORDER_COUNTER_KEY,
        value: next as unknown as Prisma.InputJsonValue,
      },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    const year = new Date().getFullYear();
    return `NK-${year}-${String(next).padStart(6, '0')}`;
  }
}
