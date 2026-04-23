import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import type { JwtPayload } from '../auth/types';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  CreateProductDto,
  UpdateProductDto,
} from './dto/products.dto';
import { ProductsService } from './products.service';

interface BulkBody {
  ids: string[];
  action: 'delete' | 'restore' | 'setStatus';
  status?: ProductStatus;
}

@UseGuards(AdminOnlyGuard)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Query() pagination: PaginationDto,
    @Query('status') status?: ProductStatus,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.products.listAdmin(pagination, {
      status,
      includeDeleted: includeDeleted === 'true',
    });
  }

  // Static paths declared BEFORE :id so they match first.

  @Get('trash')
  listTrash(@Query() pagination: PaginationDto) {
    return this.products.listTrash({
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  @Post('bulk')
  bulk(@Body() body: BulkBody, @CurrentUser() user: JwtPayload) {
    const actor = { id: user.sub, email: user.email };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids debe ser un array no vacío');
    }
    switch (body.action) {
      case 'delete':
        return this.products.bulkSoftDelete(body.ids, actor);
      case 'restore':
        return this.products.bulkRestore(body.ids, actor);
      case 'setStatus':
        if (
          !body.status ||
          !Object.values(ProductStatus).includes(body.status)
        ) {
          throw new BadRequestException('status inválido');
        }
        return this.products.bulkUpdateStatus(body.ids, body.status, actor);
      default:
        throw new BadRequestException('action inválida');
    }
  }

  @Post('trash/empty')
  emptyTrash(@CurrentUser() user: JwtPayload) {
    return this.products.purgeAllTrash({ id: user.sub, email: user.email });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.products.getByIdAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload) {
    return this.products.create(dto, { id: user.sub, email: user.email });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.products.update(id, dto, { id: user.sub, email: user.email });
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.products.restore(id, { id: user.sub, email: user.email });
  }

  /** Hard delete. Only works on soft-deleted rows. */
  @Delete(':id/purge')
  purge(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.products.purge(id, { id: user.sub, email: user.email });
  }

  /** Default DELETE = soft delete (sends to trash). */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.products.remove(id, { id: user.sub, email: user.email });
  }
}
