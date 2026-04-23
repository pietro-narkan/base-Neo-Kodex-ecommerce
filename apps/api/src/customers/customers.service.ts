import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  isGuest?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(params: ListParams) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 30, 100);
    const q = params.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      ...(typeof params.isGuest === 'boolean' ? { isGuest: params.isGuest } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { rut: { contains: q } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        rut: c.rut,
        isGuest: c.isGuest,
        ordersCount: c._count.orders,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getByIdAdmin(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: { select: { id: true, productName: true, quantity: true, subtotal: true } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const lifetimeValue = customer.orders
      .filter((o) => o.paymentStatus === 'PAID')
      .reduce((s, o) => s + o.total, 0);

    return {
      ...customer,
      lifetimeValue,
      ordersCount: customer.orders.length,
    };
  }
}
