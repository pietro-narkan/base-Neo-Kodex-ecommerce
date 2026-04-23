import { Module } from '@nestjs/common';

import {
  ReviewsAdminController,
  ReviewsPublicController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsAdminController, ReviewsPublicController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
