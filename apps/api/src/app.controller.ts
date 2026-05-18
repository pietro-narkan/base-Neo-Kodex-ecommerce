import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from './auth/decorators/public.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      name: 'Neo-Kodex API',
      version: '0.0.1',
      status: 'running',
      endpoints: {
        health: '/api/health',
        ready: '/api/health/ready',
      },
    };
  }
}
