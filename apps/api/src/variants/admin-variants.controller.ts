import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { CreateVariantDto, UpdateVariantDto } from './dto/variants.dto';
import { VariantsService } from './variants.service';

@UseGuards(AdminOnlyGuard)
@Controller('admin')
export class AdminVariantsController {
  constructor(private readonly variants: VariantsService) {}

  @Post('products/:productId/variants')
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.variants.create(productId, dto);
  }

  @Get('variants/:id')
  getById(@Param('id') id: string) {
    return this.variants.getById(id);
  }

  @Patch('variants/:id')
  update(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return this.variants.update(id, dto);
  }

  @Delete('variants/:id')
  remove(@Param('id') id: string) {
    return this.variants.remove(id);
  }
}
