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

const MAX_CSV_BYTES = 25 * 1024 * 1024; // 25 MB (5k rows × ~2-5 KB)

@UseGuards(AdminOnlyGuard)
@Controller('admin/products/import')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentUser() user: JwtPayload) {
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

    const options: ProductImportOptions = {
      priceIncludesTax: parseBool(fields.priceIncludesTax, true),
    };

    return this.imports.start(buffer, filename, options, user.sub);
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
