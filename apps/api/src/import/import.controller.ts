import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import type { JwtPayload } from '../auth/types';
import type { ProductImportOptions } from './dto/import-options.dto';
import { ImportService } from './import.service';
import type { ColumnMappings } from './wc-csv-parser';

const MAX_CSV_BYTES = 25 * 1024 * 1024; // 25 MB (5k rows × ~2-5 KB)

@UseGuards(AdminOnlyGuard)
@Controller('admin/products/import')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  // Step 1 of the wizard: accepts the CSV, returns headers + first row + suggested mappings.
  // Does NOT create a job or mutate anything.
  @Post('preview')
  async preview(@Req() req: FastifyRequest) {
    const buffer = await this.readFirstFile(req);
    return this.imports.preview(buffer);
  }

  // Step 3: actually run the import.
  // Accepts `file`, `priceIncludesTax`, and an optional `mappings` JSON field.
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentUser() user: JwtPayload) {
    const { buffer, filename, fields } = await this.readMultipart(req);

    const options: ProductImportOptions = {
      priceIncludesTax: parseBool(fields.priceIncludesTax, true),
    };

    let mappings: ColumnMappings | undefined;
    if (fields.mappings) {
      try {
        mappings = JSON.parse(fields.mappings) as ColumnMappings;
      } catch {
        throw new BadRequestException('mappings inválido (JSON malformado)');
      }
    }

    return this.imports.start(buffer, filename, options, mappings, user.sub);
  }

  private async readFirstFile(req: FastifyRequest): Promise<Buffer> {
    const { buffer } = await this.readMultipart(req);
    return buffer;
  }

  private async readMultipart(req: FastifyRequest): Promise<{
    buffer: Buffer;
    filename: string;
    fields: Record<string, string>;
  }> {
    if (!req.isMultipart()) {
      throw new BadRequestException('Content-Type debe ser multipart/form-data');
    }
    let buffer: Buffer | null = null;
    let filename = 'import.csv';
    const fields: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
        filename = part.filename || filename;
      } else {
        fields[part.fieldname] = String((part as { value: unknown }).value);
      }
    }

    if (!buffer) {
      throw new BadRequestException('Archivo CSV obligatorio (field "file")');
    }
    if (buffer.length > MAX_CSV_BYTES) {
      throw new BadRequestException(
        `CSV supera el tamaño máximo (${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB)`,
      );
    }
    return { buffer, filename, fields };
  }

  @Get()
  list(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Number(limit), 100) : 20;
    return this.imports.listJobs(Number.isFinite(n) && n > 0 ? n : 20);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.imports.getJob(id);
  }
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  const t = v.trim().toLowerCase();
  if (t === '1' || t === 'true' || t === 'yes' || t === 'on') return true;
  if (t === '0' || t === 'false' || t === 'no' || t === 'off') return false;
  return fallback;
}
