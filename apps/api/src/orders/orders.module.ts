import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';
import { ProvidersModule } from '../providers/providers.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CouponsModule, ProvidersModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
