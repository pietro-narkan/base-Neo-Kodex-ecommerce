import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CategoriesService } from './categories.service';

@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.categories.listPublic(pagination);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.categories.getBySlugPublic(slug);
  }
}
