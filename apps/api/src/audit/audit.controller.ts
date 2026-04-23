import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';

/** Audit log is sensitive — super-ADMIN only. */
@UseGuards(AdminOnlyGuard, RolesGuard)
@RequireRoles()
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('actorId') actorId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.audit.list({
      limit: limit ? Number(limit) : undefined,
      cursor,
      actorId,
      entityType,
      entityId,
      fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    });
  }
}
