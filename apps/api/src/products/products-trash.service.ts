import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

const RETENTION_SETTING_KEY = 'trash.product_retention_days';
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Daily job that hard-deletes soft-deleted products older than
 * `trash.product_retention_days` (Setting; default 30). Runs at 3am to
 * avoid peak traffic.
 *
 * To disable the cron entirely, set the setting to 0 (or any value <= 0).
 * To trigger manually for testing: call `purgeExpired()` directly.
 */
@Injectable()
export class ProductsTrashService {
  private readonly logger = new Logger(ProductsTrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredScheduled(): Promise<void> {
    try {
      const { count, retentionDays } = await this.purgeExpired();
      if (count > 0) {
        this.logger.log(
          `Papelera: purgados ${count} productos con deletedAt > ${retentionDays} días`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Papelera: falló el purge automático — ${(err as Error).message}`,
      );
    }
  }

  /** Reads retention from Setting, runs the purge. Exposed for manual trigger. */
  async purgeExpired(): Promise<{ count: number; retentionDays: number }> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: RETENTION_SETTING_KEY },
    });
    const retentionDays =
      typeof setting?.value === 'number' ? setting.value : DEFAULT_RETENTION_DAYS;

    // retentionDays <= 0 → cron deshabilitado (admin opt-out explícito)
    if (retentionDays <= 0) return { count: 0, retentionDays };

    const cutoff = new Date(Date.now() - retentionDays * 86400_000);
    const result = await this.products.purgeAllTrash(undefined, cutoff);
    return { count: result.count, retentionDays };
  }
}
