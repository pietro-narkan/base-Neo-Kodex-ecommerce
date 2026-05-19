import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';
import { EmailsModule } from '../emails/emails.module';
import { ProvidersModule } from '../providers/providers.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CouponsModule, ProvidersModule, EmailsModule, WebhooksModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
