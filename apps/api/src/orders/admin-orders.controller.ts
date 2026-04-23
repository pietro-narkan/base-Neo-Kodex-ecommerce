import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import type { JwtPayload } from '../auth/types';
import {
  AdminOrderListQueryDto,
  UpdateItemQuantityDto,
  UpdateOrderAddressDto,
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

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemQuantityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.updateItemQuantity(id, itemId, dto.quantity, {
      id: user.sub,
      email: user.email,
    });
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.removeItem(id, itemId, {
      id: user.sub,
      email: user.email,
    });
  }

  @Patch(':id/address')
  updateAddress(
    @Param('id') id: string,
    @Body() dto: UpdateOrderAddressDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.updateAddress(id, dto.kind, dto.address, {
      id: user.sub,
      email: user.email,
    });
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.orders.getTimeline(id);
  }

  @Get(':id/notes')
  listNotes(@Param('id') id: string) {
    return this.orders.listNotes(id);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() body: { content: string; isPublic?: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.addNote(
      id,
      { content: body.content, isPublic: Boolean(body.isPublic) },
      { id: user.sub, email: user.email },
    );
  }

  @Delete(':id/notes/:noteId')
  removeNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.removeNote(id, noteId, {
      id: user.sub,
      email: user.email,
    });
  }
}
