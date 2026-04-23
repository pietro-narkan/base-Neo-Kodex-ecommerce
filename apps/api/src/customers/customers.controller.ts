import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CustomersService } from './customers.service';

@UseGuards(AdminOnlyGuard, RolesGuard)
@RequireRoles('ORDERS_MANAGER', 'VIEWER')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('isGuest') isGuest?: string,
  ) {
    return this.customers.listAdmin({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      isGuest: isGuest === 'true' ? true : isGuest === 'false' ? false : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.getByIdAdmin(id);
  }
}
