import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { processImage } from './image-processor';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface UploadParams {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  productId?: string;
  variantId?: string;
  alt?: string;
  position?: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(params: UploadParams) {
    if (!ALLOWED_MIME_TYPES.has(params.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${params.mimetype}`,
      );
    }
    if (params.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Archivo excede el tamaño máximo (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
      );
    }

    if (params.productId) {
      const p = await this.prisma.product.findUnique({
        where: { id: params.productId },
      });
      if (!p) {
        throw new BadRequestException('productId inválido');
      }
    }
    if (params.variantId) {
      const v = await this.prisma.variant.findUnique({
        where: { id: params.variantId },
      });
      if (!v) {
        throw new BadRequestException('variantId inválido');
      }
    }

    // Optimizamos antes de subir: resize + WebP + strip EXIF. Fallback al original si sharp falla.
    const processed = await processImage(
      params.buffer,
      params.filename,
      params.mimetype,
    );
    const saved = processed.buffer.length;
    const original = params.buffer.length;
    if (saved < original) {
      this.logger.log(
        `Imagen optimizada: ${(original / 1024).toFixed(0)}KB → ${(saved / 1024).toFixed(0)}KB (-${Math.round((1 - saved / original) * 100)}%)`,
      );
    }

    const { key, url } = await this.storage.uploadBuffer(
      processed.buffer,
      processed.filename,
      processed.mimetype,
    );

    return this.prisma.media.create({
      data: {
        url,
        key,
        alt: params.alt,
        position: params.position ?? 0,
        productId: params.productId,
        variantId: params.variantId,
      },
    });
  }

  async remove(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) {
      throw new NotFoundException('Media no encontrada');
    }
    if (media.key) {
      await this.storage.deleteObject(media.key).catch(() => undefined);
    }
    await this.prisma.media.delete({ where: { id } });
    return { ok: true };
  }
}
