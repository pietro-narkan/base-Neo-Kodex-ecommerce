import { Module } from '@nestjs/common';

import { DteService } from './dte.service';
import { EmailService } from './email.service';
import { PaymentService } from './payment.service';
import { ShippingService } from './shipping.service';
import { WebpayProvider } from './webpay.provider';

@Module({
  providers: [
    PaymentService,
    WebpayProvider,
    EmailService,
    DteService,
    ShippingService,
  ],
  exports: [
    PaymentService,
    WebpayProvider,
    EmailService,
    DteService,
    ShippingService,
  ],
})
export class ProvidersModule {}
