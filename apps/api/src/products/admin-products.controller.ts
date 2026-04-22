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

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
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
  list(@Query() pagination: PaginationDto) {
    return this.products.listAdmin(pagination);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.products.getByIdAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }
}
