import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';

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
