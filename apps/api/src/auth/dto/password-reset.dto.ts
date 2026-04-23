import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserKind } from '@prisma/client';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsEnum(UserKind)
  userKind!: UserKind;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsEnum(UserKind)
  userKind!: UserKind;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  newPassword!: string;
}
