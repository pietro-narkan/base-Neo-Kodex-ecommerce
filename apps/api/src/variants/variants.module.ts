import { Module } from '@nestjs/common';

import { AdminVariantsController } from './admin-variants.controller';
import { VariantsService } from './variants.service';

@Module({
  controllers: [AdminVariantsController],
  providers: [VariantsService],
  exports: [VariantsService],
})
export class VariantsModule {}
