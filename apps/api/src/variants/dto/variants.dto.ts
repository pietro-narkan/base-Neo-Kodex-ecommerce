import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceNet!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  compareAtPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  heightCm?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  attributeValueIds?: string[];
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceNet?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  compareAtPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  heightCm?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  attributeValueIds?: string[];
}
