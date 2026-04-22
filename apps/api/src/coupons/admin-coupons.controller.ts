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
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupons.dto';

@UseGuards(AdminOnlyGuard)
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.coupons.list(pagination);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.coupons.getById(id);
  }

  @Post()
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}
