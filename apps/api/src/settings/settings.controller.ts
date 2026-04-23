import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { SettingsService } from './settings.service';

@UseGuards(AdminOnlyGuard, RolesGuard)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.listAll();
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.settings.getByKey(key);
  }

  /** Only super-ADMIN can change settings — critical config. */
  @RequireRoles()
  @Put(':key')
  upsert(
    @Param('key') key: string,
    @Body('value') value: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.settings.upsert(key, value, { id: user.sub, email: user.email });
  }
}
