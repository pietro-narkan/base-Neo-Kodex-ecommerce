import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { slugify } from '../common/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CategoryUpserter } from './category-upserter';
import type { ImportRowError, ProductImportOptions } from './dto/import-options.dto';
import { ImageDownloader } from './image-downloader';
import { parseWooCommerceCsv, type ParsedRow } from './wc-csv-parser';

const DEFAULT_TAX_RATE_BP = 1900;
const TAX_SETTING_KEY = 'store.tax_rate_bp';

function netToGross(net: number, taxRateBp: number): number {
  return Math.round(net * (1 + taxRateBp / 10000));
}

function grossToNet(gross: number, taxRateBp: number): number {
  return Math.round(gross / (1 + taxRateBp / 10000));
}

// Jobs held in-memory while their processing is active.
// If the API restarts mid-job, `onModuleInit` marks any PROCESSING jobs as FAILED
// (users can re-upload the CSV to retry).
interface ActiveJob {
  rows: ParsedRow[];
  options: ProductImportOptions;
}

@Injectable()
export class ImportService implements OnModuleInit {
  private readonly logger = new Logger(ImportService.name);
  private readonly activeJobs = new Map<string, ActiveJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    const orphaned = await this.prisma.importJob.updateMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: [
          {
            row: 0,
            message:
              'El job fue interrumpido por un reinicio del servidor. Volvé a subir el CSV.',
          },
        ],
      },
    });
    if (orphaned.count > 0) {
      this.logger.warn(`Marked ${orphaned.count} orphaned import jobs as FAILED`);
    }
  }

  async start(
    buffer: Buffer,
    filename: string,
    options: ProductImportOptions,
    createdById: string | undefined,
  ): Promise<{ jobId: string; totalRows: number }> {
    const { rows } = parseWooCommerceCsv(buffer);

    const job = await this.prisma.importJob.create({
      data: {
        type: 'PRODUCTS',
        status: 'PENDING',
        filename,
        totalRows: rows.length,
        options: options as unknown as Prisma.InputJsonValue,
        createdById,
      },
    });

    this.activeJobs.set(job.id, { rows, options });

    // Fire-and-forget: run async so the HTTP response returns immediately.
    setImmediate(() => {
      this.processJob(job.id).catch((err) => {
        this.logger.error(`Import job ${job.id} crashed`, err);
      });
    });

    return { jobId: job.id, totalRows: rows.length };
  }

  async getJob(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job no encontrado');
    return job;
  }

  async listJobs(limit = 20) {
    return this.prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async processJob(jobId: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) {
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: [{ row: 0, message: 'Rows no disponibles (reinicio?)' }],
        },
      });
      return;
    }

    const { rows, options } = active;
    const errors: ImportRowError[] = [];
    const warnings: ImportRowError[] = [];
    let processed = 0;
    let successCount = 0;
    let updateCount = 0;
    let failCount = 0;

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const categoryUpserter = new CategoryUpserter(this.prisma);
    const imageDownloader = new ImageDownloader(this.storage);
    const taxRateBp = await this.resolveTaxRateBp(options);

    try {
      for (const row of rows) {
        try {
          if (row.type === 'simple') {
            const result = await this.upsertSimpleProduct(
              row,
              options,
              taxRateBp,
              categoryUpserter,
              imageDownloader,
              warnings,
            );
            if (result === 'created') successCount += 1;
            else updateCount += 1;
          } else if (row.type === 'variable' || row.type === 'variation') {
            warnings.push({
              row: row.rowIndex,
              sku: row.sku || undefined,
              message: `Tipo "${row.type}" aún no soportado por el importador. Fila omitida.`,
            });
          } else {
            warnings.push({
              row: row.rowIndex,
              sku: row.sku || undefined,
              message: 'Tipo desconocido o vacío. Fila omitida.',
            });
          }
        } catch (err) {
          failCount += 1;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({
            row: row.rowIndex,
            sku: row.sku || undefined,
            message: msg,
          });
          this.logger.warn(`Row ${row.rowIndex} failed: ${msg}`);
        }

        processed += 1;

        // Persist progress every 10 rows to avoid hammering the DB.
        if (processed % 10 === 0) {
          await this.prisma.importJob
            .update({
              where: { id: jobId },
              data: {
                processedRows: processed,
                successCount,
                updateCount,
                failCount,
                errors: errors as unknown as Prisma.InputJsonValue,
                warnings: warnings as unknown as Prisma.InputJsonValue,
              },
            })
            .catch(() => undefined);
        }
      }

      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          processedRows: processed,
          successCount,
          updateCount,
          failCount,
          errors: errors as unknown as Prisma.InputJsonValue,
          warnings: warnings as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(`Fatal error in job ${jobId}`, err);
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          processedRows: processed,
          successCount,
          updateCount,
          failCount,
          errors: [
            ...errors,
            {
              row: 0,
              message: err instanceof Error ? err.message : String(err),
            },
          ] as unknown as Prisma.InputJsonValue,
          warnings: warnings as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async resolveTaxRateBp(options: ProductImportOptions): Promise<number> {
    if (typeof options.taxRateBp === 'number') return options.taxRateBp;
    const setting = await this.prisma.setting.findUnique({
      where: { key: TAX_SETTING_KEY },
    });
    return typeof setting?.value === 'number'
      ? setting.value
      : DEFAULT_TAX_RATE_BP;
  }

  private async upsertSimpleProduct(
    row: ParsedRow,
    options: ProductImportOptions,
    taxRateBp: number,
    categories: CategoryUpserter,
    images: ImageDownloader,
    warnings: ImportRowError[],
  ): Promise<'created' | 'updated'> {
    if (!row.sku) throw new Error('SKU vacío');
    if (!row.name) throw new Error('Nombre vacío');
    if (row.priceNormal === null) {
      throw new Error('Precio normal vacío o inválido');
    }

    const priceNet = options.priceIncludesTax
      ? grossToNet(row.priceNormal, taxRateBp)
      : row.priceNormal;
    const priceGross = netToGross(priceNet, taxRateBp);
    const compareAtPrice =
      row.priceSale !== null && row.priceSale > 0
        ? options.priceIncludesTax
          ? row.priceSale
          : netToGross(row.priceSale, taxRateBp)
        : null;

    const category = await categories.ensureMostSpecific(row.categoryPaths);

    const existingVariant = await this.prisma.variant.findUnique({
      where: { sku: row.sku },
      include: { product: { include: { media: true } } },
    });

    let productId: string;
    let outcome: 'created' | 'updated';

    if (existingVariant) {
      // UPDATE path: keep slug, update fields
      productId = existingVariant.productId;
      outcome = 'updated';
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          name: row.name,
          description: row.description,
          shortDesc: row.shortDesc,
          active: row.isActive,
          featured: row.isFeatured,
          categoryId: category?.id ?? null,
        },
      });
      await this.prisma.variant.update({
        where: { id: existingVariant.id },
        data: {
          name: null,
          priceNet,
          priceGross,
          compareAtPrice,
          stock: row.stock ?? existingVariant.stock,
          weightGrams: row.weightGrams ?? existingVariant.weightGrams,
          lengthCm: row.lengthCm ?? existingVariant.lengthCm,
          widthCm: row.widthCm ?? existingVariant.widthCm,
          heightCm: row.heightCm ?? existingVariant.heightCm,
          active: row.isActive,
        },
      });
    } else {
      // CREATE path
      const slug = await this.findAvailableProductSlug(row.name);
      const created = await this.prisma.product.create({
        data: {
          name: row.name,
          slug,
          description: row.description,
          shortDesc: row.shortDesc,
          active: row.isActive,
          featured: row.isFeatured,
          categoryId: category?.id ?? null,
          variants: {
            create: {
              sku: row.sku,
              priceNet,
              priceGross,
              compareAtPrice,
              stock: row.stock ?? 0,
              weightGrams: row.weightGrams,
              lengthCm: row.lengthCm,
              widthCm: row.widthCm,
              heightCm: row.heightCm,
              active: row.isActive,
            },
          },
        },
      });
      productId = created.id;
      outcome = 'created';
    }

    // Images: idempotent by sourceUrl.
    if (row.imageUrls.length > 0) {
      const existingMedia = await this.prisma.media.findMany({
        where: { productId, sourceUrl: { in: row.imageUrls } },
        select: { sourceUrl: true },
      });
      const existingUrls = new Set(
        existingMedia.map((m) => m.sourceUrl).filter((u): u is string => !!u),
      );
      const toDownload = row.imageUrls.filter((u) => !existingUrls.has(u));

      if (toDownload.length > 0) {
        const basePosition = await this.prisma.media.count({
          where: { productId },
        });
        const { ok, failed } = await images.downloadMany(toDownload);
        for (const f of failed) {
          warnings.push({
            row: row.rowIndex,
            sku: row.sku,
            message: `Imagen no descargada (${f.sourceUrl}): ${f.reason}`,
          });
        }
        await this.prisma.media.createMany({
          data: ok.map((img, i) => ({
            url: img.url,
            key: img.key,
            sourceUrl: img.sourceUrl,
            productId,
            position: basePosition + i,
          })),
        });
      }
    }

    return outcome;
  }

  private async findAvailableProductSlug(name: string): Promise<string> {
    const base = slugify(name) || 'producto';
    let slug = base;
    let i = 1;
    while (await this.prisma.product.findUnique({ where: { slug } })) {
      i += 1;
      slug = `${base}-${i}`;
    }
    return slug;
  }
}
