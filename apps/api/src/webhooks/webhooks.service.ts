import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  API_VERSION,
  WEBHOOK_DELIVERY_QUEUE,
  type WebhookEventName,
  type WebhookPayload,
} from './webhooks.types';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  async dispatch(
    event: WebhookEventName,
    data: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        active: true,
        events: { has: event },
      },
    });

    if (webhooks.length === 0) return;

    const timestamp = Math.floor(Date.now() / 1000);

    for (const webhook of webhooks) {
      const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
      const payload: WebhookPayload = {
        id: eventId,
        event,
        data,
        timestamp,
        api_version: API_VERSION,
      };

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          eventId,
          payload: payload as never,
          attemptCount: 0,
        },
      });

      try {
        await this.jobs.enqueue(WEBHOOK_DELIVERY_QUEUE, {
          deliveryId: delivery.id,
        });
        this.logger.log(
          { webhookId: webhook.id, deliveryId: delivery.id, event },
          'webhook delivery scheduled',
        );
      } catch (err) {
        this.logger.error(
          {
            webhookId: webhook.id,
            deliveryId: delivery.id,
            err: (err as Error).message,
          },
          'failed to enqueue webhook delivery',
        );
      }
    }
  }
}
