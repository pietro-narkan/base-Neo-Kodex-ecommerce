import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { EmailTemplatesService } from './email-templates.service';

class UpdateTemplateDto {
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  html!: string;
}

@UseGuards(AdminOnlyGuard, RolesGuard)
@Controller('admin/email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  list() {
    return this.service.listAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  /** Solo super-ADMIN puede editar plantillas (afecta comunicación con clientes). */
  @RequireRoles()
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(
      id,
      { subject: dto.subject, html: dto.html },
      { id: user.sub, email: user.email },
    );
  }

  @RequireRoles()
  @Post(':id/reset')
  reset(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.reset(id, { id: user.sub, email: user.email });
  }

  @Post(':id/preview')
  preview(@Param('id') id: string) {
    return this.service.preview(id);
  }
}
