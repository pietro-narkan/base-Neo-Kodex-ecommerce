import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/errors/global-exception.filter';
import { initSentry } from './common/sentry';

async function bootstrap() {
  initSentry();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT')) || 3001;
  const corsOrigin = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigin.length ? corsOrigin : true,
    credentials: true,
  });

  await app.register(helmet as any, {
    contentSecurityPolicy: false,
  });

  // Rate limiting with two buckets per IP:
  //  - auth endpoints (login / forgot / reset): 10 req / 15 min (bruteforce mitigation)
  //  - everything else: 100 req / minute (generous for normal traffic)
  // On exceed: 429 with Retry-After header.
  const AUTH_PATHS = new Set([
    '/api/v1/auth/admin/login',
    '/api/v1/auth/customer/login',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
  ]);
  const isAuthRoute = (url: string): boolean => AUTH_PATHS.has(url);

  await app.register(rateLimit as any, {
    global: true,
    max: (req: { url: string }) => (isAuthRoute(req.url) ? 10 : 100),
    timeWindow: (req: { url: string }) =>
      isAuthRoute(req.url) ? '15 minutes' : '1 minute',
    keyGenerator: (req: { ip: string; url: string }) =>
      isAuthRoute(req.url) ? `${req.ip}:auth` : req.ip,
    allowList: (req: { url: string }) => req.url === '/api' || req.url === '/api/',
    errorResponseBuilder: (_req: unknown, ctx: { after: string }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Demasiados intentos. Volvé a probar en ${ctx.after}.`,
    }),
  });

  await app.register(multipart as any, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 1,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Neo-Kodex Ecommerce API')
    .setDescription(
      'Headless ecommerce platform API. ' +
        'Auth via Bearer JWT. Errors follow {error:{code,message,details,requestId}}.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/', 'Current host')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `[api] listening on http://localhost:${port}/api/v1 (docs: /api/docs)`,
  );
}

bootstrap();
