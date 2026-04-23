import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { AdminsService } from './admins.service';
import {
  ChangeOwnPasswordDto,
  CreateAdminDto,
  UpdateAdminDto,
} from './dto/admins.dto';

/**
 * Only super-ADMIN can create/update/delete other admins.
 * @RequireRoles() empty = super-ADMIN only.
 * Exception: /me/password is open to any admin via a per-handler opt-out.
 */
@UseGuards(AdminOnlyGuard, RolesGuard)
@RequireRoles()
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  list() {
    return this.admins.list();
  }

  // Static paths must be declared BEFORE the :id dynamic route so Nest
  // matches them first (otherwise "me" would be interpreted as an id).
  // Overriding roles at handler level: any admin can change their own password.
  @Patch('me/password')
  @RequireRoles('CATALOG_MANAGER', 'ORDERS_MANAGER', 'VIEWER')
  changeOwnPassword(
    @Body() dto: ChangeOwnPasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admins.changeOwnPassword(user.sub, dto, {
      id: user.sub,
      email: user.email,
    });
  }

  @Post()
  create(
    @Body() dto: CreateAdminDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admins.create(dto, { id: user.sub, email: user.email });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.admins.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admins.update(id, dto, { id: user.sub, email: user.email });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.admins.remove(id, { id: user.sub, email: user.email });
  }
}
