import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { effectivePriceGross, effectivePriceNet } from '../common/pricing';
import { CouponsService } from '../coupons/coupons.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TAX_RATE_BP = 1900;
const TAX_SETTING_KEY = 'store.tax_rate_bp';

const cartInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
              media: { orderBy: { position: 'asc' as const } },
            },
          },
          attributes: {
            include: {
              attributeValue: { include: { attribute: true } },
            },
          },
          media: { orderBy: { position: 'asc' as const } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export interface CartIdentity {
  customerId?: string;
  sessionId?: string;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
  ) {}

  private async resolveCart(
    identity: CartIdentity,
    createIfMissing = true,
  ): Promise<CartWithItems> {
    if (!identity.customerId && !identity.sessionId) {
      throw new BadRequestException(
        'Requiere customerId (autenticado) o header X-Cart-Session',
      );
    }

    let cart: CartWithItems | null = null;

    if (identity.customerId) {
      cart = await this.prisma.cart.findFirst({
        where: { customerId: identity.customerId },
        include: cartInclude,
      });
    } else if (identity.sessionId) {
      cart = await this.prisma.cart.findUnique({
        where: { sessionId: identity.sessionId },
        include: cartInclude,
      });
    }

    if (!cart && createIfMissing) {
      cart = await this.prisma.cart.create({
        data: {
          customerId: identity.customerId,
          sessionId: identity.customerId ? undefined : identity.sessionId,
        },
        include: cartInclude,
      });
    }

    if (!cart) {
      throw new NotFoundException('Carrito no encontrado');
    }
    return cart;
  }

  async getCart(identity: CartIdentity) {
    const cart = await this.resolveCart(identity, true);
    return this.withTotals(cart);
  }

  async addItem(
    identity: CartIdentity,
    variantId: string,
    quantity: number,
  ) {
    const cart = await this.resolveCart(identity, true);

    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
    });
    if (!variant || !variant.active) {
      throw new BadRequestException('Variante no válida');
    }

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    const newQty = (existing?.quantity ?? 0) + quantity;
    if (newQty > variant.stock) {
      throw new BadRequestException(
        `Stock insuficiente. Disponible: ${variant.stock}`,
      );
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity },
      });
    }

    return this.reloadAndTotals(cart.id);
  }

  async updateItem(
    identity: CartIdentity,
    itemId: string,
    quantity: number,
  ) {
    const cart = await this.resolveCart(identity, false);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Item no encontrado en el carrito');
    }

    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      const variant = await this.prisma.variant.findUnique({
        where: { id: item.variantId },
      });
      if (!variant) {
        throw new BadRequestException('Variante no encontrada');
      }
      if (quantity > variant.stock) {
        throw new BadRequestException(
          `Stock insuficiente. Disponible: ${variant.stock}`,
        );
      }
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity },
      });
    }

    return this.reloadAndTotals(cart.id);
  }

  async removeItem(identity: CartIdentity, itemId: string) {
    const cart = await this.resolveCart(identity, false);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Item no encontrado');
    }
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.reloadAndTotals(cart.id);
  }

  async applyCoupon(identity: CartIdentity, code: string) {
    const cart = await this.resolveCart(identity, false);
    const now = new Date();
    const subtotalGross = cart.items.reduce(
      (sum, i) => sum + effectivePriceGross(i.variant, now) * i.quantity,
      0,
    );
    await this.coupons.validateAndCalculate(code, subtotalGross);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: code.toUpperCase() },
    });
    return this.reloadAndTotals(cart.id);
  }

  async removeCoupon(identity: CartIdentity) {
    const cart = await this.resolveCart(identity, false);
    if (cart.couponCode) {
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: { couponCode: null },
      });
    }
    return this.reloadAndTotals(cart.id);
  }

  async mergeGuestCart(customerId: string, guestSessionId: string) {
    const guestCart = await this.prisma.cart.findUnique({
      where: { sessionId: guestSessionId },
      include: cartInclude,
    });
    if (!guestCart) {
      return this.getCart({ customerId });
    }
    if (guestCart.customerId && guestCart.customerId !== customerId) {
      throw new ForbiddenException('El carrito pertenece a otro cliente');
    }

    const customerCart = await this.prisma.cart.findFirst({
      where: { customerId },
      include: cartInclude,
    });

    if (!customerCart) {
      // promote guest cart a cart del cliente
      await this.prisma.cart.update({
        where: { id: guestCart.id },
        data: { customerId, sessionId: null },
      });
    } else {
      // merge items (sumar cantidades)
      for (const guestItem of guestCart.items) {
        const existing = customerCart.items.find(
          (i) => i.variantId === guestItem.variantId,
        );
        if (existing) {
          await this.prisma.cartItem.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + guestItem.quantity },
          });
        } else {
          await this.prisma.cartItem.create({
            data: {
              cartId: customerCart.id,
              variantId: guestItem.variantId,
              quantity: guestItem.quantity,
            },
          });
        }
      }
      if (!customerCart.couponCode && guestCart.couponCode) {
        await this.prisma.cart.update({
          where: { id: customerCart.id },
          data: { couponCode: guestCart.couponCode },
        });
      }
      await this.prisma.cart.delete({ where: { id: guestCart.id } });
    }

    return this.getCart({ customerId });
  }

  private async reloadAndTotals(cartId: string) {
    const updated = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: cartInclude,
    });
    return this.withTotals(updated);
  }

  private async withTotals(cart: CartWithItems) {
    const now = new Date();
    const subtotalGross = cart.items.reduce(
      (sum, i) => sum + effectivePriceGross(i.variant, now) * i.quantity,
      0,
    );
    const subtotalNet = cart.items.reduce(
      (sum, i) => sum + effectivePriceNet(i.variant, now) * i.quantity,
      0,
    );
    const taxAmount = subtotalGross - subtotalNet;

    let discountAmount = 0;
    if (cart.couponCode) {
      try {
        const result = await this.coupons.validateAndCalculate(
          cart.couponCode,
          subtotalGross,
        );
        discountAmount = result.discountAmount;
      } catch {
        // El cupón ya no es válido — lo ignoramos silenciosamente
        discountAmount = 0;
      }
    }

    const total = Math.max(0, subtotalGross - discountAmount);
    return {
      ...cart,
      totals: {
        subtotalNet,
        subtotalGross,
        taxAmount,
        discountAmount,
        shippingAmount: 0,
        total,
      },
    };
  }
}
