import { Controller, Get } from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  root() {
    return {
      name: 'Neo-Kodex API',
      version: '0.0.1',
      status: 'running',
      endpoints: {
        health: '/api/health',
      },
    };
  }

  @Get('health')
  async health() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'connected' : 'error',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
