import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';

import { AdminsModule } from './admins/admins.module';
import { AnalyticsModule } from './analytics/analytics.module';
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
import { EmailsModule } from './emails/emails.module';
import { ImportModule } from './import/import.module';
import { MediaModule } from './media/media.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ProvidersModule } from './providers/providers.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SeoModule } from './seo/seo.module';
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
    // NOTE: LoggerModule reads env vars at module init via process.env. It must
    // come AFTER ConfigModule.forRoot() in this imports array so dotenv has
    // already populated process.env. The empty inject:[] is intentional — pino
    // is bootstrap-critical and we want to avoid coupling to ConfigService here.
    LoggerModule.forRootAsync({
      inject: [],
      useFactory: () => ({
        pinoHttp: {
          level: process.env.LOG_LEVEL ?? 'info',
          transport:
            process.env.LOG_PRETTY === 'true'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:standard' },
                }
              : undefined,
          genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
            const raw = req.headers['x-request-id'];
            const incoming = Array.isArray(raw) ? raw[0] : raw;
            return incoming ?? randomUUID();
          },
          // Surface requestId at the top of each log line for easy querying.
          // pino-http's default serializer also emits req.id with the same value —
          // duplication is intentional and documented.
          customProps: (req: import('http').IncomingMessage & { id?: import('pino-http').ReqId }) => ({
            requestId: req.id,
          }),
          redact: {
            paths: [
              // Headers — emitted by pino-http default serializer
              'req.headers.authorization',
              'req.headers.cookie',
              // Body — NOT emitted by default; these paths only activate if a
              // controller explicitly logs `{ body }`. Future-proofing.
              'req.body.password',
              'req.body.passwordConfirm',
              'req.body.newPassword',
              'req.body.currentPassword',
              'req.body.token',
              'req.body.refreshToken',
              'req.body.rut',
              'req.body.apiKey',
              // Wildcards — match anywhere in the logged tree
              '*.creditCard',
              '*.cvv',
            ],
            censor: '[REDACTED]',
          },
          // Use pino-http's default req/res serializers (headers, method, url,
          // statusCode, remoteAddress). They populate the fields that the redact
          // paths above target.
        },
      }),
    }),
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
    EmailsModule,
    AnalyticsModule,
    CustomersModule,
    DashboardModule,
    ShippingRatesModule,
    PaymentsModule,
    SeoModule,
    ReviewsModule,
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
