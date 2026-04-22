import { Controller, Get, Param } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { CouponsService } from './coupons.service';

@Public()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get(':code')
  getByCode(@Param('code') code: string) {
    return this.coupons.getByCode(code);
  }
}
