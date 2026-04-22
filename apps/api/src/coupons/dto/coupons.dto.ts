import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum CouponTypeDto {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsEnum(CouponTypeDto)
  type!: CouponTypeDto;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsEnum(CouponTypeDto)
  type?: CouponTypeDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
