import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import type { ProviderId } from '../providers/payment.service';
import { PaymentsService } from './payments.service';

class UpdateWebpayDto {
  @IsIn(['integration', 'production'])
  environment!: 'integration' | 'production';

  @IsString()
  commerceCode!: string;

  // Opcional — si no viene, se preserva la apiKey guardada. Permite editar
  // environment / commerceCode sin exponer ni reescribir la llave en el UI.
  @IsOptional()
  @IsString()
  apiKey?: string;
}

class SetActiveProviderDto {
  @IsIn(['manual', 'webpay', 'mercadopago', 'flow'])
  provider!: ProviderId;
}

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

  @Put('webpay/config')
  @RequireRoles()
  updateWebpay(
    @Body() dto: UpdateWebpayDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.updateWebpayConfig(dto, {
      id: user.sub,
      email: user.email,
    });
  }

  @Put('active')
  @RequireRoles()
  setActive(
    @Body() dto: SetActiveProviderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.setActiveProvider(dto.provider, {
      id: user.sub,
      email: user.email,
    });
  }
}
