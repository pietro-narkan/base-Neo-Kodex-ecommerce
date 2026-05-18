import { ValidationPipe, VersioningType } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import fastifyMultipart from '@fastify/multipart';

import { AppModule } from '../../src/app.module';
import { GlobalHttpExceptionFilter } from '../../src/common/errors/global-exception.filter';

export async function buildTestApp(): Promise<NestFastifyApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  await app.register(fastifyMultipart);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Neo-Kodex Ecommerce API')
    .setDescription('Test build')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerUiEnabled: false, // no @fastify/static needed in tests
  });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
