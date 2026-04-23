import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { AnalyticsService } from './analytics.service';

class UpdateAnalyticsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  headHtml!: string;

  @IsString()
  bodyHtml!: string;
}

@UseGuards(AdminOnlyGuard, RolesGuard)
@Controller('admin/analytics')
export class AnalyticsAdminController {
  constructor(private readonly service: AnalyticsService) {}

  @Get()
  list() {
    return this.service.listAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @RequireRoles()
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnalyticsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, { id: user.sub, email: user.email });
  }

  @RequireRoles()
  @Post(':id/reset')
  reset(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.reset(id, { id: user.sub, email: user.email });
  }
}

/**
 * Endpoint público — consumido por el storefront para inyectar los snippets
 * de tracking. No expone nada sensible: los scripts ya son client-side y
 * visibles para cualquier visitante que abra el view-source del sitio.
 */
@Controller('public/analytics')
export class AnalyticsPublicController {
  constructor(private readonly service: AnalyticsService) {}

  @Public()
  @Get()
  snippets() {
    return this.service.publicSnippets();
  }
}
