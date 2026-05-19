import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { CouponsService } from './coupons.service';

@ApiTags('Coupons')
@Public()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get(':code')
  getByCode(@Param('code') code: string) {
    return this.coupons.getByCode(code);
  }
}
