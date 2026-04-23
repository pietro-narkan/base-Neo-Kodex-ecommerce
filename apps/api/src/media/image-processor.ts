import { Logger } from '@nestjs/common';
import sharp from 'sharp';

const MAX_DIMENSION = 2000;
const WEBP_QUALITY = 85;

export interface ProcessedImage {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  width?: number;
  height?: number;
}

const logger = new Logger('ImageProcessor');

/**
 * Procesa imágenes antes de subir a storage:
 *  - Resize si alguna dim > MAX_DIMENSION (mantiene aspect ratio)
 *  - Convierte a WebP con quality 85 (JPEG/PNG → WebP: típicamente -60% size)
 *  - Strip EXIF (privacy + tamaño)
 *  - Preserva GIF animados (sharp mata la animación por default si convierte)
 *  - Fallback: si sharp falla (archivo corrupto, etc.), devuelve el buffer original
 *
 * No toca webp/avif entrantes más allá de resize + EXIF strip porque ya están comprimidos.
 */
export async function processImage(
  inputBuffer: Buffer,
  originalName: string,
  inputMime: string,
): Promise<ProcessedImage> {
  // Animated GIFs quedan como están para no perder la animación.
  if (inputMime === 'image/gif') {
    return {
      buffer: inputBuffer,
      filename: originalName,
      mimetype: inputMime,
    };
  }

  try {
    const pipeline = sharp(inputBuffer, { failOnError: false }).rotate(); // autoOrient

    const metadata = await pipeline.metadata();
    const needsResize =
      (metadata.width ?? 0) > MAX_DIMENSION ||
      (metadata.height ?? 0) > MAX_DIMENSION;

    if (needsResize) {
      pipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert JPEG/PNG to WebP (much better compression).
    // AVIF / WebP entrantes: re-encodeamos a WebP para normalizar.
    const out = await pipeline
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    // Si el output es MÁS GRANDE que el input (raro, puede pasar con imagen ya
    // muy optimizada), devolvemos el original para no empeorar.
    if (out.data.length >= inputBuffer.length && inputMime === 'image/webp') {
      return {
        buffer: inputBuffer,
        filename: originalName,
        mimetype: inputMime,
      };
    }

    const baseName = originalName.replace(/\.[^.]+$/, '') || 'image';
    return {
      buffer: out.data,
      filename: `${baseName}.webp`,
      mimetype: 'image/webp',
      width: out.info.width,
      height: out.info.height,
    };
  } catch (err) {
    logger.warn(
      `Image processing failed (${originalName}): ${(err as Error).message}. Uploading original.`,
    );
    return {
      buffer: inputBuffer,
      filename: originalName,
      mimetype: inputMime,
    };
  }
}
