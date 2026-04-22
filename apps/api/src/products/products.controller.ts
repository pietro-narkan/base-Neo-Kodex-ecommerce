import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { ProductListQueryDto } from './dto/products.dto';
import { ProductsService } from './products.service';

@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ProductListQueryDto) {
    return this.products.listPublic(
      { page: query.page, limit: query.limit },
      { categoryId: query.categoryId, featured: query.featured },
    );
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.products.getBySlugPublic(slug);
  }
}
