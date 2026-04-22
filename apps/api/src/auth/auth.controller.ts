import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import {
  AdminLoginDto,
  CustomerLoginDto,
  CustomerRegisterDto,
} from './dto/auth.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { JwtPayload } from './types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('admin/login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto.email, dto.password);
  }

  @Public()
  @Post('customer/register')
  customerRegister(@Body() dto: CustomerRegisterDto) {
    return this.auth.customerRegister(dto);
  }

  @Public()
  @Post('customer/login')
  customerLogin(@Body() dto: CustomerLoginDto) {
    return this.auth.customerLogin(dto.email, dto.password);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  refresh(@CurrentUser() user: JwtPayload) {
    return this.auth.refresh(user.sub, user.type);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
