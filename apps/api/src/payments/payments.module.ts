import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { ProvidersModule } from '../providers/providers.module';
import {
  PaymentsController,
  PublicPaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebpayReturnController } from './webpay-return.controller';

@Module({
  imports: [ProvidersModule, OrdersModule],
  controllers: [
    PaymentsController,
    PublicPaymentsController,
    WebpayReturnController,
  ],
  providers: [PaymentsService],
})
export class PaymentsModule {}
