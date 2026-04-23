import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ReviewStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/types';
import { ReviewsService } from './reviews.service';

// ============================================================
// DTOs
// ============================================================

class CreateReviewDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  comment!: string;
}

class UpdateReviewsSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  starsEnabled!: boolean;

  @IsBoolean()
  starsRequired!: boolean;
}

class ModerateDto {
  @IsString()
  status!: 'PENDING' | 'APPROVED' | 'HIDDEN';
}

class ReplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reply?: string | null;
}

// ============================================================
// Public controller — storefront
// ============================================================

@Controller('reviews')
export class ReviewsPublicController {
  constructor(private readonly service: ReviewsService) {}

  @Public()
  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  /**
   * Chequea si un email puede dejar review de un producto. Usado por el
   * storefront para decidir si mostrar el form o un mensaje explicativo
   * antes de que el cliente pierda tiempo escribiendo.
   */
  @Public()
  @Get('eligibility')
  async eligibility(
    @Query('productId') productId: string,
    @Query('email') email: string,
  ) {
    if (!productId || !email) {
      throw new BadRequestException('productId y email son requeridos');
    }
    return this.service.checkEligibility(email, productId);
  }

  @Public()
  @Get()
  list(
    @Query('productId') productId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!productId) throw new BadRequestException('productId es requerido');
    return this.service.listApprovedByProduct(productId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Public()
  @Post()
  create(@Body() dto: CreateReviewDto) {
    return this.service.createPublic(dto);
  }
}

// ============================================================
// Admin controller
// ============================================================

const VALID_STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'HIDDEN'];

@UseGuards(AdminOnlyGuard, RolesGuard)
@Controller('admin/reviews')
export class ReviewsAdminController {
  constructor(private readonly service: ReviewsService) {}

  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @RequireRoles()
  @Put('settings')
  updateSettings(
    @Body() dto: UpdateReviewsSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateSettings(dto, {
      id: user.sub,
      email: user.email,
    });
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedStatus =
      status && VALID_STATUSES.includes(status as ReviewStatus)
        ? (status as ReviewStatus)
        : undefined;
    return this.service.listAdmin({
      status: normalizedStatus,
      productId: productId || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @RequireRoles()
  @Post(':id/moderate')
  moderate(
    @Param('id') id: string,
    @Body() dto: ModerateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!VALID_STATUSES.includes(dto.status as ReviewStatus)) {
      throw new BadRequestException('Status inválido');
    }
    return this.service.setStatus(id, dto.status as ReviewStatus, {
      id: user.sub,
      email: user.email,
    });
  }

  @RequireRoles()
  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setReply(id, dto.reply ?? null, {
      id: user.sub,
      email: user.email,
    });
  }

  @RequireRoles()
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, { id: user.sub, email: user.email });
  }
}
