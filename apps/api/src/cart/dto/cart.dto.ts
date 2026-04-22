import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';

export class AddToCartDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantity!: number;
}

export class ApplyCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class MergeCartDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
