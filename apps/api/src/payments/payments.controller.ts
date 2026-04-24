import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ArrayUnique, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
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

class SetEnabledProvidersDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(['manual', 'webpay', 'mercadopago', 'flow'], { each: true })
  providers!: ProviderId[];
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

  @Put('enabled')
  @RequireRoles()
  setEnabled(
    @Body() dto: SetEnabledProvidersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.setEnabledProviders(dto.providers, {
      id: user.sub,
      email: user.email,
    });
  }
}

/**
 * Endpoint público para el storefront — lista los métodos habilitados y
 * configurados para que el cliente elija uno en el checkout. No expone
 * nada sensible (solo id, nombre y descripción).
 */
@Controller('public/payments')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get()
  list() {
    return this.payments.listPublicMethods();
  }
}
