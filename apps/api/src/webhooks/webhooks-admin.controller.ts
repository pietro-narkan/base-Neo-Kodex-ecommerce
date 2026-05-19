import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { AppException } from '../common/errors/app-exception';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhooks.dto';
import { generateSecret } from './webhook-signer';
import {
  API_VERSION,
  WEBHOOK_DELIVERY_QUEUE,
  type WebhookEventName,
} from './webhooks.types';

@ApiTags('Admin · Webhooks')
@ApiBearerAuth()
@UseGuards(AdminOnlyGuard)
@Controller('admin/webhooks')
export class WebhooksAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  @Get()
  async list(@Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 50;
    const [data, total] = await Promise.all([
      this.prisma.webhook.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.webhook.count(),
    ]);
    return { data, total, page, limit };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!webhook) {
      throw new AppException('NOT_FOUND', 'Webhook no encontrado', 404);
    }
    return webhook;
  }

  @Post()
  async create(@Body() dto: CreateWebhookDto) {
    const secret = generateSecret();
    const webhook = await this.prisma.webhook.create({
      data: {
        name: dto.name,
        url: dto.url,
        events: dto.events,
        active: dto.active ?? true,
        secret,
      },
    });
    return { ...webhook, secret };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException('NOT_FOUND', 'Webhook no encontrado', 404);
    }
    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException('NOT_FOUND', 'Webhook no encontrado', 404);
    }
    await this.prisma.webhook.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/rotate-secret')
  async rotateSecret(@Param('id') id: string) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException('NOT_FOUND', 'Webhook no encontrado', 404);
    }
    const secret = generateSecret();
    await this.prisma.webhook.update({
      where: { id },
      data: { secret },
    });
    return { secret };
  }

  @Post(':id/test')
  async test(@Param('id') id: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      throw new AppException('NOT_FOUND', 'Webhook no encontrado', 404);
    }
    const eventId = `evt_test_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      id: eventId,
      event: 'test.ping' as WebhookEventName,
      data: { message: 'Test ping from Neo-Kodex admin', timestamp },
      timestamp,
      api_version: API_VERSION,
    };
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: 'test.ping',
        eventId,
        payload: payload as never,
      },
    });
    await this.jobs.enqueue(WEBHOOK_DELIVERY_QUEUE, { deliveryId: delivery.id });
    return { ok: true, deliveryId: delivery.id };
  }

  @Get(':id/deliveries')
  async listDeliveries(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const take = Math.min(Number(limit ?? 100), 200);
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const hasMore = deliveries.length > take;
    const data = hasMore ? deliveries.slice(0, -1) : deliveries;
    const nextCursor = hasMore ? data[data.length - 1].id : null;
    return { data, nextCursor };
  }
}
