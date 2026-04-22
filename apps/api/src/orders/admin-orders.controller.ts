import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import {
  AdminOrderListQueryDto,
  UpdateOrderStatusDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

@UseGuards(AdminOnlyGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: AdminOrderListQueryDto) {
    return this.orders.listAdmin(
      { page: query.page, limit: query.limit },
      { status: query.status as OrderStatus | undefined },
    );
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.orders.getByIdAdmin(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, dto.status as OrderStatus);
  }
}
