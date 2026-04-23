import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  return startOfDay(new Date(Date.now() - n * 86400_000));
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const today = startOfDay(new Date());
    const sevenDaysAgo = daysAgo(7);
    const thirtyDaysAgo = daysAgo(30);

    const [
      salesToday,
      sales7d,
      sales30d,
      pendingPayment,
      pendingFulfillment,
      lowStockVariants,
      newCustomers30d,
      topProducts,
      latestOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: { createdAt: { gte: today }, paymentStatus: 'PAID' },
      }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: { createdAt: { gte: sevenDaysAgo }, paymentStatus: 'PAID' },
      }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: { createdAt: { gte: thirtyDaysAgo }, paymentStatus: 'PAID' },
      }),
      this.prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
      this.prisma.order.count({
        where: { status: 'PAID' }, // paid but not yet fulfilled
      }),
      this.prisma.variant.findMany({
        where: { stock: { lt: 5 }, active: true },
        include: { product: { select: { name: true, slug: true } } },
        orderBy: { stock: 'asc' },
        take: 10,
      }),
      this.prisma.customer.count({
        where: { createdAt: { gte: thirtyDaysAgo }, isGuest: false },
      }),
      this.prisma.orderItem.groupBy({
        by: ['sku', 'productName'],
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
        where: { order: { createdAt: { gte: thirtyDaysAgo }, paymentStatus: 'PAID' } },
      }),
      this.prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          total: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      sales: {
        today: {
          count: salesToday._count.id,
          amount: salesToday._sum.total ?? 0,
        },
        last7d: {
          count: sales7d._count.id,
          amount: sales7d._sum.total ?? 0,
        },
        last30d: {
          count: sales30d._count.id,
          amount: sales30d._sum.total ?? 0,
        },
      },
      pending: {
        payment: pendingPayment,
        fulfillment: pendingFulfillment,
      },
      newCustomers30d,
      lowStock: lowStockVariants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        productName: v.product.name,
        productSlug: v.product.slug,
        stock: v.stock,
      })),
      topProducts: topProducts.map((t) => ({
        sku: t.sku,
        name: t.productName,
        unitsSold: t._sum.quantity ?? 0,
        revenue: t._sum.subtotal ?? 0,
      })),
      latestOrders,
    };
  }
}
