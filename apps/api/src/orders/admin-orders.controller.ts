import {
  Body,
  Controller,
  Get,
  Header,
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

function parseDateOrUndefined(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@UseGuards(AdminOnlyGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: AdminOrderListQueryDto) {
    return this.orders.listAdmin(
      { page: query.page, limit: query.limit },
      {
        status: query.status as OrderStatus | undefined,
        q: query.q,
        from: parseDateOrUndefined(query.from),
        to: parseDateOrUndefined(query.to),
      },
    );
  }

  // Streams matching orders as CSV. Declared BEFORE :id so the literal route wins.
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="orders-export.csv"')
  exportCsv(@Query() query: AdminOrderListQueryDto) {
    return this.orders.exportAdmin({
      status: query.status as OrderStatus | undefined,
      q: query.q,
      from: parseDateOrUndefined(query.from),
      to: parseDateOrUndefined(query.to),
    });
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
