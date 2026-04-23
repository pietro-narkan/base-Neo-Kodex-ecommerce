import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { ShippingRatesService } from './shipping-rates.service';

interface UpsertBody {
  region: string;
  rate: number;
  freeThreshold?: number | null;
  etaDays?: number | null;
  active?: boolean;
}

@UseGuards(AdminOnlyGuard, RolesGuard)
@Controller('admin/shipping-rates')
export class ShippingRatesController {
  constructor(private readonly rates: ShippingRatesService) {}

  @Get()
  list() {
    return this.rates.list();
  }

  /** Only super-ADMIN can touch shipping rates (affects every checkout). */
  @Put()
  @RequireRoles()
  upsert(@Body() body: UpsertBody, @CurrentUser() user: JwtPayload) {
    return this.rates.upsert(body, { id: user.sub, email: user.email });
  }

  @Delete(':region')
  @RequireRoles()
  remove(@Param('region') region: string, @CurrentUser() user: JwtPayload) {
    return this.rates.remove(region, { id: user.sub, email: user.email });
  }
}
