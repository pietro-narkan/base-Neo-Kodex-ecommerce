import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  @Public()
  @Get()
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{
    status: 'ok' | 'degraded';
    checks: { db: boolean; storage: boolean };
  }> {
    const [dbResult, storageResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.storage.isReachable(),
    ]);
    const db = dbResult.status === 'fulfilled';
    const storage =
      storageResult.status === 'fulfilled' && storageResult.value === true;
    const status = db && storage ? 'ok' : 'degraded';
    return { status, checks: { db, storage } };
  }

  @Public()
  @Get('jobs')
  async jobsStatus(): Promise<{
    status: 'ok' | 'degraded';
    queues: Array<{ name: string; queueSize: number; scheduledCount: number }>;
  }> {
    const knownQueues = ['webhook-delivery'];
    const queues: Array<{
      name: string;
      queueSize: number;
      scheduledCount: number;
    }> = [];

    for (const name of knownQueues) {
      try {
        const [queueSize, scheduledCount] = await Promise.all([
          this.jobs.getQueueSize(name),
          this.jobs.getScheduledCount(name),
        ]);
        queues.push({ name, queueSize, scheduledCount });
      } catch {
        return { status: 'degraded', queues };
      }
    }

    return { status: 'ok', queues };
  }
}
