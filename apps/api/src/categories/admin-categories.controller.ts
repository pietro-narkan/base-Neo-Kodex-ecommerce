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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/categories.dto';

@UseGuards(AdminOnlyGuard)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.categories.listAll(pagination);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.categories.getById(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
