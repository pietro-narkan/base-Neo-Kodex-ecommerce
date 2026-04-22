import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { MediaService } from './media.service';

@UseGuards(AdminOnlyGuard)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  async upload(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new BadRequestException(
        'Content-Type debe ser multipart/form-data',
      );
    }

    let buffer: Buffer | null = null;
    let filename = '';
    let mimetype = '';
    const fields: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        filename = part.filename;
        mimetype = part.mimetype;
      } else {
        fields[part.fieldname] = String((part as { value: unknown }).value);
      }
    }

    if (!buffer) {
      throw new BadRequestException('El archivo "file" es obligatorio');
    }

    return this.media.upload({
      buffer,
      filename,
      mimetype,
      productId: fields.productId,
      variantId: fields.variantId,
      alt: fields.alt,
      position: fields.position ? Number(fields.position) : undefined,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.media.remove(id);
  }
}
