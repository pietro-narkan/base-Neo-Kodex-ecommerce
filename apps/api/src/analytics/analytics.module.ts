import { Module } from '@nestjs/common';

import {
  AnalyticsAdminController,
  AnalyticsPublicController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsAdminController, AnalyticsPublicController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
