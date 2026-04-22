import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';
import { CartController, CustomerCartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [CouponsModule],
  controllers: [CartController, CustomerCartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
