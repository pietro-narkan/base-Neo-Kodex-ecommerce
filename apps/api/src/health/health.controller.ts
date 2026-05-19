import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
}
