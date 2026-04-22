import { Module } from '@nestjs/common';

import { DteService } from './dte.service';
import { EmailService } from './email.service';
import { PaymentService } from './payment.service';
import { ShippingService } from './shipping.service';

@Module({
  providers: [PaymentService, EmailService, DteService, ShippingService],
  exports: [PaymentService, EmailService, DteService, ShippingService],
})
export class ProvidersModule {}
