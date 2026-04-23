import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

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
    '/api/auth/admin/login',
    '/api/auth/customer/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
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

  // Parser x-www-form-urlencoded — requerido por el callback de Webpay,
  // que hace POST al returnUrl con el body en formato form (no JSON).
  await app.register(formbody as any);

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

  app.setGlobalPrefix('api');

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}/api`);
}

bootstrap();
