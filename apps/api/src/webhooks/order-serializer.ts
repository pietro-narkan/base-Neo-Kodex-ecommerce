import type { Prisma } from '@prisma/client';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        variant: {
          include: {
            product: { select: { id: true; name: true; slug: true } };
          };
        };
      };
    };
    shippingAddress: true;
    billingAddress: true;
    customer: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
        isGuest: true;
      };
    };
  };
}>;

/** Public-facing snapshot of an order for webhook payloads.
 *  Strips internal-only fields (no internal notes, no audit, no secrets). */
export function serializeOrderForWebhook(
  order: OrderWithRelations,
): Record<string, unknown> {
  return {
    id: order.id,
    number: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    documentType: order.documentType,
    subtotalNet: order.subtotalNet,
    subtotalGross: order.subtotalGross,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    shippingAmount: order.shippingAmount,
    total: order.total,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.variant?.productId ?? null,
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      priceNet: item.priceNet,
      priceGross: item.priceGross,
      subtotal: item.subtotal,
    })),
    customer: order.customer
      ? {
          id: order.customer.id,
          email: order.customer.email,
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          isGuest: order.customer.isGuest,
        }
      : null,
    shippingAddress: order.shippingAddress
      ? {
          line1: order.shippingAddress.line1,
          line2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          region: order.shippingAddress.region,
          country: order.shippingAddress.country,
          postalCode: order.shippingAddress.postalCode,
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
