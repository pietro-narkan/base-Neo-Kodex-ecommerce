import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksCleanupCron {
  private readonly logger = new Logger(WebhooksCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup(): Promise<void> {
    const retentionDays = Number(
      process.env.WEBHOOK_DELIVERY_RETENTION_DAYS ?? '30',
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.webhookDelivery.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(
      { deleted: result.count, retentionDays },
      'webhook deliveries cleanup completed',
    );
  }
}
