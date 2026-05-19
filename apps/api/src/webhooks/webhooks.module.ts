import { Module, OnApplicationBootstrap } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { JobsService } from '../jobs/jobs.service';
import { WebhookDeliveryHandler } from './webhook-delivery.handler';
import { WebhooksAdminController } from './webhooks-admin.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksCleanupCron } from './webhooks-cleanup.cron';
import { WEBHOOK_DELIVERY_QUEUE } from './webhooks.types';

@Module({
  imports: [PrismaModule],
  controllers: [WebhooksAdminController],
  providers: [WebhooksService, WebhookDeliveryHandler, WebhooksCleanupCron],
  exports: [WebhooksService],
})
export class WebhooksModule implements OnApplicationBootstrap {
  constructor(
    private readonly jobs: JobsService,
    private readonly handler: WebhookDeliveryHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.work<{ deliveryId: string }>(
      WEBHOOK_DELIVERY_QUEUE,
      async (job) => this.handler.handle(job),
    );
  }
}
