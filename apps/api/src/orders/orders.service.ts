import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentType, OrderStatus, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { CouponsService } from '../coupons/coupons.service';
import { PrismaService } from '../prisma/prisma.service';
import { DteService } from '../providers/dte.service';
import type { DocumentTypeLiteral } from '../providers/dte.service';
import { EmailService } from '../providers/email.service';
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
    private readonly email: EmailService,
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
    const subtotalGrossPreview = cart.items.reduce(
      (s, i) => s + i.variant.priceGross * i.quantity,
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
        (s, i) => s + i.variant.priceNet * i.quantity,
        0,
      );
      const subtotalGross = cart.items.reduce(
        (s, i) => s + i.variant.priceGross * i.quantity,
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
    try {
      const paymentResult = await this.payment.init({
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        email: order.email,
        firstName: order.firstName,
        lastName: order.lastName,
      });
      paymentInstructions = paymentResult.instructions;
      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentReference: paymentResult.reference },
      });
    } catch (err) {
      this.logger.error(
        `Payment init falló para orden ${order.orderNumber}: ${(err as Error).message}`,
      );
    }

    // Email "orden recibida" con instrucciones de pago (best-effort, no tira errores)
    await this.email.send({
      to: order.email,
      subject: `Orden recibida — ${order.orderNumber}`,
      text: this.buildOrderCreatedText(order, paymentInstructions),
      html: this.buildOrderCreatedHtml(order, paymentInstructions),
    });

    // Admin notification (best-effort, skippea si no hay store.contact_email seteado)
    await this.sendAdminNewOrderEmail(order).catch((err) =>
      this.logger.warn(`Admin notification falló: ${(err as Error).message}`),
    );

    return { ...order, paymentInstructions };
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
          await this.payment.refund(current.paymentReference);
        } catch (err) {
          this.logger.error(
            `Refund falló para orden ${current.orderNumber}: ${(err as Error).message}`,
          );
        }
      }
    }
    return updated;
  }

  // ===== Post-commit hooks =====

  private async onOrderPaid(order: OrderWithRelations): Promise<void> {
    // Email de confirmación
    await this.email.send({
      to: order.email,
      subject: `Pago confirmado — ${order.orderNumber}`,
      text: this.buildOrderPaidText(order),
      html: this.buildOrderPaidHtml(order),
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

  private itemsText(order: OrderWithRelations): string {
    return order.items
      .map(
        (i) =>
          `  - ${i.productName}${i.variantName ? ` (${i.variantName})` : ''} x ${i.quantity}  →  $${formatCLP(i.subtotal)}`,
      )
      .join('\n');
  }

  private itemsHtml(order: OrderWithRelations): string {
    return order.items
      .map(
        (i) =>
          `<li>${i.productName}${i.variantName ? ` (${i.variantName})` : ''} × ${i.quantity} — $${formatCLP(i.subtotal)}</li>`,
      )
      .join('');
  }

  private buildOrderCreatedText(
    order: OrderWithRelations,
    paymentInstructions?: string,
  ): string {
    return [
      `¡Hola ${order.firstName}! Recibimos tu orden ${order.orderNumber}.`,
      '',
      'Resumen:',
      this.itemsText(order),
      '',
      `Subtotal:  $${formatCLP(order.subtotalGross)}`,
      `Descuento: -$${formatCLP(order.discountAmount)}`,
      `Envío:     $${formatCLP(order.shippingAmount)}`,
      `Total:     $${formatCLP(order.total)}`,
      '',
      paymentInstructions
        ? `Instrucciones de pago:\n${paymentInstructions}`
        : '',
      '',
      'Te avisaremos cuando confirmemos el pago.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildOrderCreatedHtml(
    order: OrderWithRelations,
    paymentInstructions?: string,
  ): string {
    const instructionsBlock = paymentInstructions
      ? `<h3>Instrucciones de pago</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;">${paymentInstructions}</pre>`
      : '';
    return `
<h2>¡Gracias por tu compra!</h2>
<p>Hola <strong>${order.firstName}</strong>, recibimos tu orden <strong>${order.orderNumber}</strong>.</p>
<ul>${this.itemsHtml(order)}</ul>
<table>
  <tr><td>Subtotal</td><td style="text-align:right">$${formatCLP(order.subtotalGross)}</td></tr>
  <tr><td>Descuento</td><td style="text-align:right">-$${formatCLP(order.discountAmount)}</td></tr>
  <tr><td>Envío</td><td style="text-align:right">$${formatCLP(order.shippingAmount)}</td></tr>
  <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>$${formatCLP(order.total)}</strong></td></tr>
</table>
${instructionsBlock}
<p>Te avisaremos cuando confirmemos el pago.</p>
    `.trim();
  }

  private buildOrderPaidText(order: OrderWithRelations): string {
    return [
      `¡Hola ${order.firstName}! Confirmamos el pago de tu orden ${order.orderNumber}.`,
      '',
      'Resumen:',
      this.itemsText(order),
      '',
      `Total pagado: $${formatCLP(order.total)}`,
      '',
      'Estamos preparando tu envío.',
    ].join('\n');
  }

  private buildOrderPaidHtml(order: OrderWithRelations): string {
    return `
<h2>¡Pago confirmado!</h2>
<p>Hola <strong>${order.firstName}</strong>, confirmamos el pago de tu orden <strong>${order.orderNumber}</strong>.</p>
<ul>${this.itemsHtml(order)}</ul>
<p><strong>Total pagado: $${formatCLP(order.total)}</strong></p>
<p>Estamos preparando tu envío.</p>
    `.trim();
  }

  private async sendOrderFulfilledEmail(order: OrderWithRelations): Promise<void> {
    const trackingBlock = order.trackingNumber
      ? `Código de seguimiento: ${order.trackingNumber}${order.shippingProvider ? ` (${order.shippingProvider})` : ''}`
      : '';
    const trackingHtml = order.trackingNumber
      ? `<p><strong>Código de seguimiento:</strong> ${order.trackingNumber}${order.shippingProvider ? ` <em>(${order.shippingProvider})</em>` : ''}</p>`
      : '';
    await this.email.send({
      to: order.email,
      subject: `Tu pedido fue despachado — ${order.orderNumber}`,
      text: [
        `¡Hola ${order.firstName}! Despachamos tu orden ${order.orderNumber}.`,
        '',
        'Items enviados:',
        this.itemsText(order),
        '',
        trackingBlock,
        '',
        'Gracias por tu compra.',
      ]
        .filter(Boolean)
        .join('\n'),
      html: `
<h2>Tu pedido está en camino 🚚</h2>
<p>Hola <strong>${order.firstName}</strong>, despachamos tu orden <strong>${order.orderNumber}</strong>.</p>
<ul>${this.itemsHtml(order)}</ul>
${trackingHtml}
<p>Gracias por tu compra.</p>
      `.trim(),
    });
  }

  private async sendOrderCancelledEmail(order: OrderWithRelations): Promise<void> {
    await this.email.send({
      to: order.email,
      subject: `Orden cancelada — ${order.orderNumber}`,
      text: [
        `Hola ${order.firstName},`,
        '',
        `Tu orden ${order.orderNumber} fue cancelada.`,
        '',
        'Items:',
        this.itemsText(order),
        '',
        `Total: $${formatCLP(order.total)}`,
        '',
        order.paymentStatus === 'PAID'
          ? 'Si ya habías pagado, procesaremos el reembolso en las próximas 72 horas hábiles.'
          : 'Si tenés dudas, respondé este email.',
      ].join('\n'),
      html: `
<h2>Orden cancelada</h2>
<p>Hola <strong>${order.firstName}</strong>, tu orden <strong>${order.orderNumber}</strong> fue cancelada.</p>
<ul>${this.itemsHtml(order)}</ul>
<p><strong>Total:</strong> $${formatCLP(order.total)}</p>
<p>${
        order.paymentStatus === 'PAID'
          ? 'Si ya habías pagado, procesaremos el reembolso en las próximas 72 horas hábiles.'
          : 'Si tenés dudas, respondé este email.'
      }</p>
      `.trim(),
    });
  }

  private async sendOrderRefundedEmail(order: OrderWithRelations): Promise<void> {
    await this.email.send({
      to: order.email,
      subject: `Reembolso procesado — ${order.orderNumber}`,
      text: [
        `Hola ${order.firstName},`,
        '',
        `Procesamos el reembolso de tu orden ${order.orderNumber}.`,
        '',
        `Monto reembolsado: $${formatCLP(order.total)}`,
        '',
        'El dinero puede tardar entre 3 y 10 días hábiles en aparecer en tu medio de pago.',
      ].join('\n'),
      html: `
<h2>Reembolso procesado</h2>
<p>Hola <strong>${order.firstName}</strong>, procesamos el reembolso de tu orden <strong>${order.orderNumber}</strong>.</p>
<p><strong>Monto reembolsado:</strong> $${formatCLP(order.total)}</p>
<p>El dinero puede tardar entre 3 y 10 días hábiles en aparecer en tu medio de pago.</p>
      `.trim(),
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
    await this.email.send({
      to,
      subject: `[Admin] Nueva orden ${order.orderNumber} — $${formatCLP(order.total)}`,
      text: [
        `Nueva orden ${order.orderNumber} recibida.`,
        '',
        `Cliente: ${order.firstName} ${order.lastName} (${order.email})`,
        `Teléfono: ${order.phone ?? '—'}`,
        '',
        'Items:',
        this.itemsText(order),
        '',
        `Subtotal: $${formatCLP(order.subtotalGross)}`,
        `Envío:    $${formatCLP(order.shippingAmount)}`,
        `Total:    $${formatCLP(order.total)}`,
        `Estado de pago: ${order.paymentStatus}`,
      ].join('\n'),
      html: `
<h2>Nueva orden recibida</h2>
<p><strong>${order.orderNumber}</strong> — <strong>$${formatCLP(order.total)}</strong></p>
<p>Cliente: <strong>${order.firstName} ${order.lastName}</strong> (${order.email})<br>
Teléfono: ${order.phone ?? '—'}</p>
<ul>${this.itemsHtml(order)}</ul>
<table>
  <tr><td>Subtotal</td><td>$${formatCLP(order.subtotalGross)}</td></tr>
  <tr><td>Envío</td><td>$${formatCLP(order.shippingAmount)}</td></tr>
  <tr><td><strong>Total</strong></td><td><strong>$${formatCLP(order.total)}</strong></td></tr>
</table>
<p>Pago: <strong>${order.paymentStatus}</strong></p>
      `.trim(),
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
