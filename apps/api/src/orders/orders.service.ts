import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentType, OrderStatus, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { effectivePriceGross, effectivePriceNet } from '../common/pricing';
import { CouponsService } from '../coupons/coupons.service';
import { EmailTemplatesService } from '../emails/email-templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { DteService } from '../providers/dte.service';
import type { DocumentTypeLiteral } from '../providers/dte.service';
import { PaymentService } from '../providers/payment.service';
import { ShippingService } from '../providers/shipping.service';
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

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function formatCLP(amount: number): string {
  return amount.toLocaleString('es-CL');
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
    private readonly payment: PaymentService,
    private readonly emailTemplates: EmailTemplatesService,
    private readonly dte: DteService,
    private readonly shipping: ShippingService,
    private readonly audit: AuditService,
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

    // Cálculo del envío ANTES de la transacción (no bloquea DB en una llamada externa).
    const now = new Date();
    const subtotalGrossPreview = cart.items.reduce(
      (s, i) => s + effectivePriceGross(i.variant, now) * i.quantity,
      0,
    );
    const shippingQuotes = await this.shipping.quote({
      address: params.dto.shippingAddress,
      items: cart.items.map((i) => ({
        weightGrams: i.variant.weightGrams,
        quantity: i.quantity,
      })),
      subtotalGross: subtotalGrossPreview,
    });
    const shippingAmount = shippingQuotes[0]?.cost ?? 0;

    // Transacción: stock + orden + cupón + borrar cart
    const order = await this.prisma.$transaction(async (tx) => {
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

      const subtotalNet = cart.items.reduce(
        (s, i) => s + effectivePriceNet(i.variant, now) * i.quantity,
        0,
      );
      const subtotalGross = cart.items.reduce(
        (s, i) => s + effectivePriceGross(i.variant, now) * i.quantity,
        0,
      );
      const taxAmount = subtotalGross - subtotalNet;

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

      const total = Math.max(
        0,
        subtotalGross - discountAmount + shippingAmount,
      );

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

      const orderNumber = await this.nextOrderNumber(tx);

      const created = await tx.order.create({
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
          paymentProvider: this.payment.providerName,
          shippingProvider: shippingQuotes[0]?.code ?? null,
          notes: params.dto.notes,
          items: {
            create: cart.items.map((i) => {
              const net = effectivePriceNet(i.variant, now);
              const gross = effectivePriceGross(i.variant, now);
              return {
                variantId: i.variantId,
                productName: i.variant.product.name,
                variantName: i.variant.name,
                sku: i.variant.sku,
                priceNet: net,
                priceGross: gross,
                taxAmount: gross - net,
                quantity: i.quantity,
                subtotal: gross * i.quantity,
              };
            }),
          },
        },
        include: orderInclude,
      });

      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      await tx.cart.delete({ where: { id: cart.id } });

      return created;
    });

    // ===== Post-commit hooks =====
    let paymentInstructions: string | undefined;
    let paymentRedirect:
      | { url: string; method: 'POST' | 'GET'; params: Record<string, string> }
      | undefined;
    try {
      const providerId = await this.payment.getActiveProviderId();
      const paymentResult = await this.payment.init({
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        email: order.email,
        firstName: order.firstName,
        lastName: order.lastName,
      });
      paymentInstructions = paymentResult.instructions;
      paymentRedirect = paymentResult.redirect;
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentReference: paymentResult.reference,
          paymentProvider: providerId,
        },
      });
    } catch (err) {
      this.logger.error(
        `Payment init falló para orden ${order.orderNumber}: ${(err as Error).message}`,
      );
    }

    // Email "orden recibida" con instrucciones de pago (best-effort, no tira errores)
    await this.emailTemplates.renderAndSend('order.created', order.email, {
      firstName: order.firstName,
      orderNumber: order.orderNumber,
      itemsHtml: this.itemsHtml(order),
      subtotal: formatCLP(order.subtotalGross),
      discount: formatCLP(order.discountAmount),
      shipping: formatCLP(order.shippingAmount),
      total: formatCLP(order.total),
      paymentInstructionsBlock: paymentInstructions
        ? `<h3>Instrucciones de pago</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;">${paymentInstructions}</pre>`
        : '',
    });

    // Admin notification (best-effort, skippea si no hay store.contact_email seteado)
    await this.sendAdminNewOrderEmail(order).catch((err) =>
      this.logger.warn(`Admin notification falló: ${(err as Error).message}`),
    );

    return { ...order, paymentInstructions, paymentRedirect };
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
    filters: {
      status?: OrderStatus;
      q?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q
        ? {
            OR: [
              { orderNumber: { contains: filters.q, mode: 'insensitive' } },
              { email: { contains: filters.q, mode: 'insensitive' } },
              { firstName: { contains: filters.q, mode: 'insensitive' } },
              { lastName: { contains: filters.q, mode: 'insensitive' } },
              { phone: { contains: filters.q } },
            ],
          }
        : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };
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

  /** Streams all matching orders for CSV export. Caps at 5000 rows hard. */
  async exportAdmin(filters: {
    status?: OrderStatus;
    q?: string;
    from?: Date;
    to?: Date;
  }): Promise<string> {
    const all = await this.listAdmin({ page: 1, limit: 5000 }, filters);
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'orderNumber',
      'createdAt',
      'status',
      'paymentStatus',
      'paymentProvider',
      'customerEmail',
      'customerName',
      'phone',
      'subtotalGross',
      'shippingAmount',
      'discountAmount',
      'total',
      'couponCode',
      'items',
    ];
    const rows = [header.join(',')];
    for (const o of all.data) {
      const itemsDesc = (o.items ?? [])
        .map((i) => `${i.quantity}x ${i.productName} [${i.sku}]`)
        .join(' | ');
      rows.push(
        [
          o.orderNumber,
          o.createdAt.toISOString(),
          o.status,
          o.paymentStatus,
          o.paymentProvider ?? '',
          o.email,
          `${o.firstName} ${o.lastName}`,
          o.phone ?? '',
          o.subtotalGross,
          o.shippingAmount,
          o.discountAmount,
          o.total,
          o.couponCode ?? '',
          itemsDesc,
        ]
          .map(escape)
          .join(','),
      );
    }
    return rows.join('\n');
  }

  // ===== Notes + timeline =====

  async listNotes(orderId: string) {
    await this.getByIdAdmin(orderId); // 404 if missing
    return this.prisma.orderNote.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(
    orderId: string,
    input: { content: string; isPublic: boolean },
    actor: { id: string; email: string },
  ) {
    if (!input.content?.trim()) {
      throw new BadRequestException('El contenido de la nota es obligatorio');
    }
    await this.getByIdAdmin(orderId);
    const note = await this.prisma.orderNote.create({
      data: {
        orderId,
        authorId: actor.id,
        authorType: 'ADMIN',
        authorName: actor.email,
        content: input.content.trim(),
        isPublic: input.isPublic,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: input.isPublic ? 'note.create.public' : 'note.create.internal',
      entityType: 'order',
      entityId: orderId,
      metadata: { noteId: note.id },
    });
    return note;
  }

  async removeNote(
    orderId: string,
    noteId: string,
    actor: { id: string; email: string },
  ) {
    const note = await this.prisma.orderNote.findUnique({ where: { id: noteId } });
    if (!note || note.orderId !== orderId) {
      throw new NotFoundException('Nota no encontrada');
    }
    await this.prisma.orderNote.delete({ where: { id: noteId } });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'note.delete',
      entityType: 'order',
      entityId: orderId,
      before: { content: note.content, isPublic: note.isPublic },
    });
    return { ok: true };
  }

  /**
   * Merge order-specific audit log entries with order notes into a single
   * chronological timeline. Admin UI renders this in the order detail page.
   */
  async getTimeline(orderId: string) {
    await this.getByIdAdmin(orderId);
    const [auditEntries, notes] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { entityType: 'order', entityId: orderId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.orderNote.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    type TimelineEntry = {
      id: string;
      kind: 'audit' | 'note';
      action: string;
      actorName: string;
      createdAt: Date;
      note?: {
        content: string;
        isPublic: boolean;
        authorType: string;
      };
      details?: unknown;
    };
    const merged: TimelineEntry[] = [
      ...auditEntries.map((e) => ({
        id: `audit:${e.id}`,
        kind: 'audit' as const,
        action: e.action,
        actorName: e.actorEmail,
        createdAt: e.createdAt,
        details: {
          before: e.before,
          after: e.after,
          metadata: e.metadata,
        },
      })),
      ...notes.map((n) => ({
        id: `note:${n.id}`,
        kind: 'note' as const,
        action: n.isPublic ? 'note.public' : 'note.internal',
        actorName: n.authorName,
        createdAt: n.createdAt,
        note: {
          content: n.content,
          isPublic: n.isPublic,
          authorType: n.authorType,
        },
      })),
    ];
    merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return merged;
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

  /** Decide if stock should be tracked for a given order status. Canceled or refunded orders
   *  are considered "released" — editing their items doesn't touch variant.stock.  */
  private isStockActive(status: OrderStatus): boolean {
    return status !== 'CANCELLED' && status !== 'REFUNDED';
  }

  private recalcTotals(
    items: Array<{ quantity: number; priceNet: number; priceGross: number; taxAmount: number }>,
    current: {
      shippingAmount: number;
      discountAmount: number;
    },
  ) {
    const subtotalNet = items.reduce((s, i) => s + i.priceNet * i.quantity, 0);
    const subtotalGross = items.reduce((s, i) => s + i.priceGross * i.quantity, 0);
    const taxAmount = items.reduce((s, i) => s + i.taxAmount * i.quantity, 0);
    const total = subtotalGross + current.shippingAmount - current.discountAmount;
    return { subtotalNet, subtotalGross, taxAmount, total };
  }

  /**
   * Change the quantity of a line item. If the order is in a stock-active state
   * (not cancelled/refunded), adjusts variant.stock by the delta (atomic check
   * to prevent overselling when increasing qty). Recalculates order totals.
   */
  async updateItemQuantity(
    orderId: string,
    itemId: string,
    newQty: number,
    actor: { id: string; email: string },
  ) {
    if (!Number.isInteger(newQty) || newQty < 1) {
      throw new BadRequestException('Cantidad inválida (debe ser >= 1)');
    }
    const order = await this.getByIdAdmin(orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en esta orden');
    const delta = newQty - item.quantity;
    if (delta === 0) return order;

    await this.prisma.$transaction(async (tx) => {
      // Adjust stock only when the order is "live" (not cancelled/refunded) AND
      // the item still has a linked variant (imported historical orders may not).
      if (this.isStockActive(order.status) && item.variantId) {
        if (delta > 0) {
          const result = await tx.variant.updateMany({
            where: { id: item.variantId, stock: { gte: delta } },
            data: { stock: { decrement: delta } },
          });
          if (result.count === 0) {
            throw new BadRequestException(
              `Stock insuficiente para aumentar a ${newQty} unidades`,
            );
          }
        } else {
          await tx.variant.update({
            where: { id: item.variantId },
            data: { stock: { increment: -delta } },
          });
        }
      }

      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          quantity: newQty,
          subtotal: item.priceGross * newQty,
        },
      });

      const allItems = await tx.orderItem.findMany({ where: { orderId } });
      const totals = this.recalcTotals(allItems, {
        shippingAmount: order.shippingAmount,
        discountAmount: order.discountAmount,
      });
      await tx.order.update({
        where: { id: orderId },
        data: totals,
      });
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update.item.quantity',
      entityType: 'order',
      entityId: orderId,
      before: { itemId, sku: item.sku, quantity: item.quantity },
      after: { itemId, sku: item.sku, quantity: newQty },
    });

    return this.getByIdAdmin(orderId);
  }

  /**
   * Remove a line item from the order. Returns stock if applicable. If it was
   * the last item, the order is preserved (empty) — admin must cancel explicitly.
   */
  async removeItem(
    orderId: string,
    itemId: string,
    actor: { id: string; email: string },
  ) {
    const order = await this.getByIdAdmin(orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item no encontrado en esta orden');

    await this.prisma.$transaction(async (tx) => {
      if (this.isStockActive(order.status) && item.variantId) {
        await tx.variant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
      await tx.orderItem.delete({ where: { id: itemId } });

      const allItems = await tx.orderItem.findMany({ where: { orderId } });
      const totals = this.recalcTotals(allItems, {
        shippingAmount: order.shippingAmount,
        discountAmount: order.discountAmount,
      });
      await tx.order.update({ where: { id: orderId }, data: totals });
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'remove.item',
      entityType: 'order',
      entityId: orderId,
      before: { itemId, sku: item.sku, quantity: item.quantity, productName: item.productName },
    });

    return this.getByIdAdmin(orderId);
  }

  /**
   * Update shipping or billing address of an order. Does NOT modify Customer
   * addresses (those are separate records). Creates a new Address row and
   * points the order to it; the previous address record is left untouched
   * for audit purposes.
   */
  async updateAddress(
    orderId: string,
    kind: 'shipping' | 'billing',
    dto: AddressDto,
    actor: { id: string; email: string },
  ) {
    const order = await this.getByIdAdmin(orderId);
    const created = await this.prisma.address.create({
      data: {
        customerId: order.customerId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        line1: dto.line1,
        line2: dto.line2,
        city: dto.city,
        region: dto.region,
        postalCode: dto.postalCode,
        country: dto.country ?? 'CL',
      },
    });

    const data: Prisma.OrderUpdateInput =
      kind === 'shipping'
        ? { shippingAddress: { connect: { id: created.id } } }
        : { billingAddress: { connect: { id: created.id } } };

    await this.prisma.order.update({ where: { id: orderId }, data });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: `update.${kind}Address`,
      entityType: 'order',
      entityId: orderId,
      before: kind === 'shipping'
        ? { addressId: order.shippingAddressId }
        : { addressId: order.billingAddressId },
      after: { addressId: created.id, ...dto },
    });

    return this.getByIdAdmin(orderId);
  }

  async updateStatus(id: string, status: OrderStatus) {
    const current = await this.getByIdAdmin(id);
    if (current.status === status) return current;

    const wasPaid = current.status === 'PAID';
    const willBePaid = status === 'PAID';

    const updated = await this.prisma.$transaction(async (tx) => {
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

    // ===== Post-commit hooks =====
    if (willBePaid && !wasPaid) {
      await this.onOrderPaid(updated);
      return this.getByIdAdmin(id);
    }
    // Status transition hooks (best-effort: email failures don't break the tx).
    if (status === 'FULFILLED' && current.status !== 'FULFILLED') {
      await this.sendOrderFulfilledEmail(updated).catch((err) =>
        this.logger.warn(`Fulfilled email falló: ${(err as Error).message}`),
      );
    }
    if (status === 'CANCELLED' && current.status !== 'CANCELLED') {
      await this.sendOrderCancelledEmail(updated).catch((err) =>
        this.logger.warn(`Cancelled email falló: ${(err as Error).message}`),
      );
    }
    if (status === 'REFUNDED' && current.status !== 'REFUNDED') {
      await this.sendOrderRefundedEmail(updated).catch((err) =>
        this.logger.warn(`Refunded email falló: ${(err as Error).message}`),
      );
      if (wasPaid && current.paymentReference) {
        try {
          // Usar el provider con el que se pagó la orden original, no el
          // provider activo actual (el admin puede haber cambiado de pasarela).
          const providerId =
            (current.paymentProvider as
              | 'manual'
              | 'webpay'
              | 'mercadopago'
              | 'flow'
              | null) ?? undefined;
          await this.payment.refund(
            current.paymentReference,
            current.total,
            providerId,
          );
        } catch (err) {
          this.logger.error(
            `Refund falló para orden ${current.orderNumber}: ${(err as Error).message}`,
          );
        }
      }
    }
    return updated;
  }

  // ===== Webpay return handling =====

  /**
   * Llamado desde el controller público que maneja el callback de Webpay.
   * Busca la orden por el token_ws que guardamos en paymentReference, actualiza
   * el status según el resultado del commit, y dispara onOrderPaid si es el
   * primer paso a PAID. Idempotente — si la orden ya está PAID no re-ejecuta
   * los hooks (importante porque el cliente puede refrescar la return URL).
   */
  async confirmWebpayPayment(
    tokenWs: string,
    result: {
      status: 'paid' | 'failed' | 'cancelled';
      externalReference?: string;
    },
  ): Promise<{
    orderNumber: string | null;
    state: 'paid' | 'already_paid' | 'failed' | 'not_found';
  }> {
    const order = await this.prisma.order.findFirst({
      where: { paymentReference: tokenWs, paymentProvider: 'webpay' },
      include: orderInclude,
    });
    if (!order) return { orderNumber: null, state: 'not_found' };

    if (order.paymentStatus === 'PAID') {
      return { orderNumber: order.orderNumber, state: 'already_paid' };
    }

    if (result.status === 'paid') {
      const updated = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          status: order.status === 'PENDING' ? 'PAID' : order.status,
          // paymentReference se mantiene como el token_ws original para poder
          // llamar refund() más tarde. La authorization_code se guarda aparte
          // si el usuario la necesita (hoy la dejamos solo en audit log).
        },
        include: orderInclude,
      });
      await this.audit.log({
        actorEmail: 'system:webpay',
        action: 'payment.confirmed',
        entityType: 'order',
        entityId: order.id,
        metadata: {
          authorizationCode: result.externalReference,
          tokenWs,
        },
      });
      await this.onOrderPaid(updated).catch((err) =>
        this.logger.warn(
          `onOrderPaid hooks fallaron para ${order.orderNumber}: ${(err as Error).message}`,
        ),
      );
      return { orderNumber: order.orderNumber, state: 'paid' };
    }

    // Rechazo del banco — dejamos la orden tal cual (PENDING) para que el
    // cliente pueda reintentar con otro método si quiere. Solo auditamos.
    await this.audit.log({
      actorEmail: 'system:webpay',
      action: 'payment.rejected',
      entityType: 'order',
      entityId: order.id,
      metadata: { tokenWs },
    });
    return { orderNumber: order.orderNumber, state: 'failed' };
  }

  /** Busca la orden por su id (usado cuando Transbank redirige con TBK_ID_SESION). */
  async findOrderNumberById(id: string): Promise<string | null> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      select: { orderNumber: true },
    });
    return row?.orderNumber ?? null;
  }

  // ===== Post-commit hooks =====

  private async onOrderPaid(order: OrderWithRelations): Promise<void> {
    // Email de confirmación
    await this.emailTemplates.renderAndSend('order.paid', order.email, {
      firstName: order.firstName,
      orderNumber: order.orderNumber,
      itemsHtml: this.itemsHtml(order),
      total: formatCLP(order.total),
    });

    // Emisión de DTE si corresponde
    if (order.documentType !== 'NONE') {
      const result = await this.dte.emit({
        orderId: order.id,
        orderNumber: order.orderNumber,
        documentType: order.documentType as DocumentTypeLiteral,
        email: order.email,
        firstName: order.firstName,
        lastName: order.lastName,
        rut: order.rut,
        subtotalNet: order.subtotalNet,
        taxAmount: order.taxAmount,
        total: order.total,
        items: order.items.map((i) => ({
          productName: i.productName,
          variantName: i.variantName,
          sku: i.sku,
          quantity: i.quantity,
          priceNet: i.priceNet,
          priceGross: i.priceGross,
        })),
      });
      if (result) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            documentFolio: result.folio,
            documentNumber: result.number,
            documentUrl: result.pdfUrl,
          },
        });
      }
    }
  }

  // ===== Email templates =====

  private itemsHtml(order: OrderWithRelations): string {
    return order.items
      .map(
        (i) =>
          `<li>${i.productName}${i.variantName ? ` (${i.variantName})` : ''} × ${i.quantity} — $${formatCLP(i.subtotal)}</li>`,
      )
      .join('');
  }

  private async sendOrderFulfilledEmail(order: OrderWithRelations): Promise<void> {
    const trackingBlock = order.trackingNumber
      ? `<p><strong>Código de seguimiento:</strong> ${order.trackingNumber}${order.shippingProvider ? ` <em>(${order.shippingProvider})</em>` : ''}</p>`
      : '';
    await this.emailTemplates.renderAndSend('order.fulfilled', order.email, {
      firstName: order.firstName,
      orderNumber: order.orderNumber,
      itemsHtml: this.itemsHtml(order),
      trackingBlock,
    });
  }

  private async sendOrderCancelledEmail(order: OrderWithRelations): Promise<void> {
    await this.emailTemplates.renderAndSend('order.cancelled', order.email, {
      firstName: order.firstName,
      orderNumber: order.orderNumber,
      itemsHtml: this.itemsHtml(order),
      total: formatCLP(order.total),
      refundNotice:
        order.paymentStatus === 'PAID'
          ? 'Si ya habías pagado, procesaremos el reembolso en las próximas 72 horas hábiles.'
          : 'Si tenés dudas, respondé este email.',
    });
  }

  private async sendOrderRefundedEmail(order: OrderWithRelations): Promise<void> {
    await this.emailTemplates.renderAndSend('order.refunded', order.email, {
      firstName: order.firstName,
      orderNumber: order.orderNumber,
      total: formatCLP(order.total),
    });
  }

  /**
   * Reads store.contact_email from Setting. Used for admin alerts.
   * Returns null if unset so callers can skip the email.
   */
  private async getAdminNotificationEmail(): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'store.contact_email' },
    });
    const value = setting?.value;
    return typeof value === 'string' && value.includes('@') ? value : null;
  }

  private async sendAdminNewOrderEmail(order: OrderWithRelations): Promise<void> {
    const to = await this.getAdminNotificationEmail();
    if (!to) return; // admin email not configured, skip silently
    await this.emailTemplates.renderAndSend('order.admin_new', to, {
      orderNumber: order.orderNumber,
      firstName: order.firstName,
      lastName: order.lastName,
      email: order.email,
      phone: order.phone ?? '—',
      itemsHtml: this.itemsHtml(order),
      subtotal: formatCLP(order.subtotalGross),
      shipping: formatCLP(order.shippingAmount),
      total: formatCLP(order.total),
      paymentStatus: order.paymentStatus,
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
