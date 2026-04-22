import { Module } from '@nestjs/common';

import { AdminAttributesController } from './admin-attributes.controller';
import { AttributesController } from './attributes.controller';
import { AttributesService } from './attributes.service';

@Module({
  controllers: [AttributesController, AdminAttributesController],
  providers: [AttributesService],
  exports: [AttributesService],
})
export class AttributesModule {}
