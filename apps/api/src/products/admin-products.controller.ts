import {
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
import type { ProductStatus } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import type { JwtPayload } from '../auth/types';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  CreateProductDto,
  UpdateProductDto,
} from './dto/products.dto';
import { ProductsService } from './products.service';

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

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.products.remove(id, { id: user.sub, email: user.email });
  }
}
