import { Controller, Get, UseGuards } from '@nestjs/common';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(AdminOnlyGuard)
@Controller('admin/stats')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  getStats() {
    return this.dashboard.getStats();
  }
}
