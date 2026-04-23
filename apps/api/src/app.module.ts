import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AdminsModule } from './admins/admins.module';
import { AppController } from './app.controller';
import { AttributesModule } from './attributes/attributes.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CouponsModule } from './coupons/coupons.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ImportModule } from './import/import.module';
import { MediaModule } from './media/media.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ProvidersModule } from './providers/providers.module';
import { SettingsModule } from './settings/settings.module';
import { ShippingRatesModule } from './shipping/shipping-rates.module';
import { StorageModule } from './storage/storage.module';
import { VariantsModule } from './variants/variants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    ProvidersModule,
    AuditModule,
    AuthModule,
    AdminsModule,
    CategoriesModule,
    AttributesModule,
    ProductsModule,
    VariantsModule,
    MediaModule,
    CouponsModule,
    CartModule,
    OrdersModule,
    ImportModule,
    SettingsModule,
    CustomersModule,
    DashboardModule,
    ShippingRatesModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
