import { Module } from '@nestjs/common';

import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  controllers: [CouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
