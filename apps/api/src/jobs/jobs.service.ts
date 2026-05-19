import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PgBoss from 'pg-boss';

export interface JobsEnqueueOptions {
  /** Wait N seconds before job becomes available */
  startAfter?: number;
  /** Max retries (defaults to 0 — our worker re-enqueues manually for custom backoff) */
  retryLimit?: number;
  /** Delay between retries in seconds */
  retryDelay?: number;
  /** Whether to use exponential backoff for retries */
  retryBackoff?: boolean;
  /** Job expiration (seconds since creation) — default 15 min */
  expireInSeconds?: number;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private boss: PgBoss | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for pg-boss');
    }

    const pollInterval = Number(
      this.config.get<string>('JOBS_POLL_INTERVAL') ?? '2000',
    );

    this.boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      pollingIntervalSeconds: Math.max(1, Math.floor(pollInterval / 1000)),
      application_name: 'neo-kodex-api',
    });

    this.boss.on('error', (err) => {
      this.logger.error({ err: err.message }, 'pg-boss error');
    });

    this.boss.on('wip', (data: Array<{ id: string; name: string }>) => {
      if (data.length === 0) return;
      this.logger.debug(
        { jobs: data.map((j) => ({ id: j.id, name: j.name })) },
        `pg-boss work in progress (${data.length})`,
      );
    });

    this.boss.on('monitor-states', (states) => {
      this.logger.debug({ states }, 'pg-boss queue states');
    });

    await this.boss.start();
    this.logger.log('pg-boss started (schema=pgboss)');
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop({ graceful: true, close: true, wait: true });
    this.logger.log('pg-boss stopped');
    this.boss = null;
  }

  private async ensureQueue(name: string): Promise<void> {
    // pg-boss v10 requires queues to be created before sending jobs.
    // createQueue is idempotent (ON CONFLICT DO NOTHING inside the stored proc).
    await this.boss!.createQueue(name);
  }

  async enqueue<T extends object>(
    name: string,
    data: T,
    options: JobsEnqueueOptions = {},
  ): Promise<string | null> {
    if (!this.boss) throw new Error('JobsService not initialized');
    await this.ensureQueue(name);
    return this.boss.send(name, data, {
      ...(options.startAfter !== undefined && { startAfter: options.startAfter }),
      retryLimit: options.retryLimit ?? 0,
      ...(options.retryDelay !== undefined && { retryDelay: options.retryDelay }),
      ...(options.retryBackoff !== undefined && { retryBackoff: options.retryBackoff }),
      expireInSeconds: options.expireInSeconds ?? 900,
    });
  }

  async work<T>(
    name: string,
    handler: (job: { id: string; data: T }) => Promise<void>,
    options: { batchSize?: number } = {},
  ): Promise<void> {
    if (!this.boss) throw new Error('JobsService not initialized');
    await this.ensureQueue(name);
    const concurrency = Number(
      this.config.get<string>('JOBS_CONCURRENCY') ?? '5',
    );
    // pg-boss v10: callback receives an array of jobs, not a single job
    await this.boss.work<T>(
      name,
      { batchSize: options.batchSize ?? concurrency },
      async (jobs) => {
        await Promise.all(
          jobs.map((job) => handler({ id: job.id, data: job.data })),
        );
      },
    );
  }

  async getQueueSize(name: string): Promise<number> {
    if (!this.boss) return 0;
    return this.boss.getQueueSize(name);
  }

  async getScheduledCount(name: string): Promise<number> {
    if (!this.boss) return 0;
    return this.boss.getQueueSize(name, { before: 'active' });
  }
}
