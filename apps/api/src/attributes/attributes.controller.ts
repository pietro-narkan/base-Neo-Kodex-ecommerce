import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AttributesService } from './attributes.service';

@Public()
@Controller('attributes')
export class AttributesController {
  constructor(private readonly attrs: AttributesService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.attrs.list(pagination);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.attrs.getBySlug(slug);
  }
}
