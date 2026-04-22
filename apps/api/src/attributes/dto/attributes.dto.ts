import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

export class UpdateAttributeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

export class CreateAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}
