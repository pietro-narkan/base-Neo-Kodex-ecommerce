import { Injectable, Logger } from '@nestjs/common';

import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { sign } from './webhook-signer';
import { WEBHOOK_DELIVERY_QUEUE, type WebhookPayload } from './webhooks.types';

export const MAX_ATTEMPTS = 8;
// Backoff per attempt index (0-indexed): the delay BEFORE attempt n+1.
//                            attempt 1  2     3     4      5       6       7       8
export const BACKOFF_SECONDS: number[] = [60, 300, 1800, 7200, 21600, 43200, 86400, 86400];

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BODY_CHARS = 4096;

@Injectable()
export class WebhookDeliveryHandler {
  private readonly logger = new Logger(WebhookDeliveryHandler.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.timeoutMs = Number(process.env.WEBHOOK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  async handle(job: { data: { deliveryId: string } }): Promise<void> {
    const { deliveryId } = job.data;

    const row = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });

    if (!row) {
      this.logger.warn({ deliveryId }, 'webhook delivery not found (skip)');
      return;
    }

    const { webhook } = row;
    const payload = row.payload as unknown as WebhookPayload;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(webhook.secret, timestamp, payload);

    const newAttempt = row.attemptCount + 1;

    let statusCode = 0;
    let responseBody = '';
    let isNetworkError = false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NeoKodex-Webhook/1.0',
            'X-NK-Event': row.event,
            'X-NK-Event-Id': row.eventId,
            'X-NK-Timestamp': String(timestamp),
            'X-NK-Signature': signature,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        statusCode = res.status;
        const text = await res.text().catch(() => '');
        responseBody = text.slice(0, MAX_RESPONSE_BODY_CHARS);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      isNetworkError = true;
      responseBody = `[network] ${(err as Error).message}`.slice(
        0,
        MAX_RESPONSE_BODY_CHARS,
      );
    }

    const isSuccess = statusCode >= 200 && statusCode < 300;
    const isRetryable = isNetworkError || (statusCode >= 500 && statusCode <= 599);

    if (isSuccess) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          statusCode,
          responseBody,
          attemptCount: newAttempt,
          deliveredAt: new Date(),
          failedAt: null,
          nextAttemptAt: null,
        },
      });
      this.logger.log(
        { deliveryId, webhookId: webhook.id, statusCode },
        'webhook delivered',
      );
      return;
    }

    if (isRetryable && newAttempt < MAX_ATTEMPTS) {
      const backoffSec = BACKOFF_SECONDS[newAttempt] ?? BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1];
      const nextAt = new Date(Date.now() + backoffSec * 1000);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          statusCode: isNetworkError ? null : statusCode,
          responseBody,
          attemptCount: newAttempt,
          nextAttemptAt: nextAt,
          failedAt: null,
        },
      });
      await this.jobs.enqueue(
        WEBHOOK_DELIVERY_QUEUE,
        { deliveryId },
        { startAfter: backoffSec },
      );
      this.logger.warn(
        { deliveryId, webhookId: webhook.id, statusCode, attempt: newAttempt, nextAt },
        'webhook delivery retry scheduled',
      );
      return;
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode: isNetworkError ? null : statusCode,
        responseBody,
        attemptCount: newAttempt,
        failedAt: new Date(),
        nextAttemptAt: null,
      },
    });
    this.logger.error(
      { deliveryId, webhookId: webhook.id, statusCode, attempt: newAttempt },
      'webhook delivery failed permanently',
    );
  }
}
