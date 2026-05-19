import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JobsService } from './jobs.service';

const TEST_QUEUE = 'test-jobs-roundtrip';

describe('JobsService', () => {
  let service: JobsService;

  beforeAll(async () => {
    const config = new ConfigService({
      DATABASE_URL: process.env.DATABASE_URL,
      JOBS_CONCURRENCY: '2',
      JOBS_POLL_INTERVAL: '500',
    });
    service = new JobsService(config);
    await service.onModuleInit();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('enqueue + work roundtrips a job', async () => {
    const received: Array<{ value: string }> = [];

    await service.work<{ value: string }>(TEST_QUEUE, async (job) => {
      received.push(job.data);
    });

    const id = await service.enqueue(TEST_QUEUE, { value: 'hello' });
    expect(typeof id).toBe('string');

    // Poll for completion (worker polls every 500ms)
    const deadline = Date.now() + 5000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(received).toEqual([{ value: 'hello' }]);
  });

  it('getQueueSize reports pending jobs', async () => {
    const queue = 'test-jobs-size';
    await service.enqueue(queue, { x: 1 }, { startAfter: 3600 }); // not picked up
    const size = await service.getQueueSize(queue);
    expect(size).toBeGreaterThanOrEqual(1);
  });
});
