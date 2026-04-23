import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { PaymentsService } from './payments.service';

@UseGuards(AdminOnlyGuard, RolesGuard)
@Controller('admin/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list() {
    return this.payments.listMethods();
  }

  /** Only super-ADMIN can change payment config (blast radius = every checkout). */
  @Put('manual/bank-details')
  @RequireRoles()
  updateBankDetails(
    @Body('value') value: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    if (typeof value !== 'string') {
      throw new BadRequestException('value debe ser un string');
    }
    return this.payments.updateBankDetails(value, {
      id: user.sub,
      email: user.email,
    });
  }
}
