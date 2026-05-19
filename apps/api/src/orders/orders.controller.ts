import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AppException } from '../common/errors/app-exception';
import { ErrorCodes } from '../common/errors/codes';
import type { FastifyRequest } from 'fastify';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { JwtPayload } from '../auth/types';
import {
  CheckoutDto,
  CustomerOrderListQueryDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

type ReqWithUser = FastifyRequest & { user?: JwtPayload };

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('checkout')
  checkout(
    @Req() req: ReqWithUser,
    @Body() dto: CheckoutDto,
    @Headers('x-cart-session') sessionId?: string,
  ) {
    const customerId =
      req.user?.type === 'customer' ? req.user.sub : undefined;
    return this.orders.checkout({ dto, customerId, sessionId });
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: CustomerOrderListQueryDto,
  ) {
    if (user.type !== 'customer') {
      throw new AppException(
        ErrorCodes.AUTH_FORBIDDEN,
        'Solo clientes pueden ver sus órdenes',
        403,
      );
    }
    return this.orders.listMine(user.sub, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  getMine(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    if (user.type !== 'customer') {
      throw new AppException(ErrorCodes.AUTH_FORBIDDEN, 'Forbidden', 403);
    }
    return this.orders.getMine(user.sub, id);
  }
}
