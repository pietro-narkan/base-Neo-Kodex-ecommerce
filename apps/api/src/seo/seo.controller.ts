import { Controller, Get, UseGuards } from '@nestjs/common';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { SeoService } from './seo.service';

@UseGuards(AdminOnlyGuard)
@Controller('admin/seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  /**
   * Corre todos los checks de SEO contra el catálogo actual y la config de
   * tienda. Devuelve issues agrupados por severidad + score + samples clickeables.
   * No cachea (cada click ejecuta). Para catálogos grandes, considerar un
   * reporte batch diario en el futuro.
   */
  @Get('audit')
  audit() {
    return this.seo.audit();
  }
}
