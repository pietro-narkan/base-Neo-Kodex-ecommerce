import { extname } from 'node:path';

import { Logger } from '@nestjs/common';

import { processImage } from '../media/image-processor';
import type { StorageService } from '../storage/storage.service';

export interface DownloadedImage {
  url: string;
  key: string;
  sourceUrl: string;
  contentType: string;
}

export interface DownloadFailure {
  sourceUrl: string;
  reason: string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 30_000;
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

// Host blocklist: prevents SSRF to local / private networks even if the CSV is
// crafted to target internal services. The admin is trusted, but CSVs from
// clients may contain typos or malicious URLs.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  // IPv4 literals in private ranges
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local
  const m = /^172\.(\d+)\./.exec(h);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function validateUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Protocolo no permitido: ${url.protocol}`);
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error(`Host bloqueado por política SSRF: ${url.hostname}`);
  }
  return url;
}

function extFromUrlOrContentType(url: URL, contentType: string): string {
  const ext = extname(url.pathname).toLowerCase();
  if (ext && /^\.(jpg|jpeg|png|webp|gif|avif)$/.test(ext)) return ext;
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
  };
  return map[contentType] ?? '.bin';
}

export class ImageDownloader {
  private readonly logger = new Logger(ImageDownloader.name);

  constructor(private readonly storage: StorageService) {}

  async download(sourceUrl: string): Promise<DownloadedImage> {
    const url = validateUrl(sourceUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const contentType = (res.headers.get('content-type') ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw new Error(`Content-Type no permitido: ${contentType}`);
      }
      const contentLength = Number(res.headers.get('content-length') ?? '0');
      if (contentLength > MAX_BYTES) {
        throw new Error(`Archivo demasiado grande: ${contentLength} bytes`);
      }

      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length > MAX_BYTES) {
        throw new Error(`Archivo demasiado grande: ${buf.length} bytes`);
      }

      const ext = extFromUrlOrContentType(url, contentType);
      const filename = `import${ext}`;

      // Optimizamos antes de subir (resize + WebP + EXIF strip). Si falla,
      // processImage devuelve el buffer original.
      const processed = await processImage(
        buf,
        filename,
        contentType || 'application/octet-stream',
      );

      const uploaded = await this.storage.uploadBuffer(
        processed.buffer,
        processed.filename,
        processed.mimetype,
        'imports',
      );

      return {
        url: uploaded.url,
        key: uploaded.key,
        sourceUrl,
        contentType: processed.mimetype,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Runs `download` over many URLs with bounded concurrency.
  // Returns two parallel arrays: successes and failures.
  async downloadMany(
    urls: string[],
    concurrency = 6,
  ): Promise<{ ok: DownloadedImage[]; failed: DownloadFailure[] }> {
    const ok: DownloadedImage[] = [];
    const failed: DownloadFailure[] = [];
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
      while (cursor < urls.length) {
        const i = cursor;
        cursor += 1;
        const u = urls[i];
        try {
          const img = await this.download(u);
          ok.push(img);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Image download failed (${u}): ${msg}`);
          failed.push({ sourceUrl: u, reason: msg });
        }
      }
    });

    await Promise.all(workers);
    return { ok, failed };
  }
}
