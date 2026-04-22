import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { AdminMediaController } from './admin-media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [StorageModule],
  controllers: [AdminMediaController],
  providers: [MediaService],
})
export class MediaModule {}
