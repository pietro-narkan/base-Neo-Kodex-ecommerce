import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [StorageModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
