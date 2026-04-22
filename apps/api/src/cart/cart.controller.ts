import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { JwtPayload } from '../auth/types';
import { CartService, type CartIdentity } from './cart.service';
import {
  AddToCartDto,
  ApplyCouponDto,
  MergeCartDto,
  UpdateCartItemDto,
} from './dto/cart.dto';

type ReqWithUser = FastifyRequest & { user?: JwtPayload };

function identityFrom(
  user: JwtPayload | undefined,
  sessionId: string | undefined,
): CartIdentity {
  const customerId = user?.type === 'customer' ? user.sub : undefined;
  return { customerId, sessionId };
}

@Public()
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(
    @Req() req: ReqWithUser,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    return this.cart.getCart(identityFrom(req.user, sessionId));
  }

  @Post('items')
  add(
    @Req() req: ReqWithUser,
    @Body() dto: AddToCartDto,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    return this.cart.addItem(
      identityFrom(req.user, sessionId),
      dto.variantId,
      dto.quantity,
    );
  }

  @Patch('items/:itemId')
  update(
    @Req() req: ReqWithUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    return this.cart.updateItem(
      identityFrom(req.user, sessionId),
      itemId,
      dto.quantity,
    );
  }

  @Delete('items/:itemId')
  remove(
    @Req() req: ReqWithUser,
    @Param('itemId') itemId: string,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    return this.cart.removeItem(identityFrom(req.user, sessionId), itemId);
  }

  @Post('coupon')
  applyCoupon(
    @Req() req: ReqWithUser,
    @Body() dto: ApplyCouponDto,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    return this.cart.applyCoupon(
      identityFrom(req.user, sessionId),
      dto.code,
    );
  }

  @Delete('coupon')
  removeCoupon(
    @Req() req: ReqWithUser,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    return this.cart.removeCoupon(identityFrom(req.user, sessionId));
  }
}

// Endpoint que SÍ requiere cliente autenticado
@Controller('cart')
export class CustomerCartController {
  constructor(private readonly cart: CartService) {}

  @Post('merge')
  merge(@CurrentUser() user: JwtPayload, @Body() dto: MergeCartDto) {
    if (user.type !== 'customer') {
      throw new ForbiddenException('Solo clientes pueden mergear carritos');
    }
    return this.cart.mergeGuestCart(user.sub, dto.sessionId);
  }
}
