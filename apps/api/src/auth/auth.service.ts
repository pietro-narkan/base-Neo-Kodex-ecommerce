import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthResponse, JwtPayload, UserType } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async adminLogin(email: string, password: string): Promise<AuthResponse> {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (!admin || !admin.active) {
      await this.audit.log({
        actorEmail: email,
        action: 'login.failed',
        entityType: 'admin',
        metadata: { reason: 'not_found_or_inactive' },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      await this.audit.log({
        actorId: admin.id,
        actorEmail: admin.email,
        action: 'login.failed',
        entityType: 'admin',
        entityId: admin.id,
        metadata: { reason: 'bad_password' },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.audit.log({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'login',
      entityType: 'admin',
      entityId: admin.id,
    });
    return this.issueTokens({
      sub: admin.id,
      type: 'admin',
      email: admin.email,
      role: admin.role,
    });
  }

  async customerRegister(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    rut?: string;
  }): Promise<AuthResponse> {
    const existing = await this.prisma.customer.findUnique({
      where: { email: data.email },
    });
    if (existing && !existing.isGuest) {
      throw new ConflictException('Email ya registrado');
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const customer = existing
      ? await this.prisma.customer.update({
          where: { email: data.email },
          data: {
            passwordHash,
            firstName: data.firstName ?? existing.firstName,
            lastName: data.lastName ?? existing.lastName,
            phone: data.phone ?? existing.phone,
            rut: data.rut ?? existing.rut,
            isGuest: false,
          },
        })
      : await this.prisma.customer.create({
          data: {
            email: data.email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            rut: data.rut,
            isGuest: false,
          },
        });
    return this.issueTokens({
      sub: customer.id,
      type: 'customer',
      email: customer.email,
    });
  }

  async customerLogin(
    email: string,
    password: string,
  ): Promise<AuthResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: { email },
    });
    if (!customer || !customer.passwordHash || customer.isGuest) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(password, customer.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueTokens({
      sub: customer.id,
      type: 'customer',
      email: customer.email,
    });
  }

  async refresh(sub: string, type: UserType): Promise<AuthResponse> {
    let email: string;
    let role: import('@prisma/client').AdminRole | undefined;
    if (type === 'admin') {
      const admin = await this.prisma.admin.findUnique({ where: { id: sub } });
      if (!admin || !admin.active) {
        throw new UnauthorizedException();
      }
      email = admin.email;
      role = admin.role;
    } else {
      const customer = await this.prisma.customer.findUnique({
        where: { id: sub },
      });
      if (!customer || customer.isGuest) {
        throw new UnauthorizedException();
      }
      email = customer.email;
    }
    return this.issueTokens({ sub, type, email, role });
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('REFRESH_SECRET'),
      expiresIn: this.config.get<string>('REFRESH_EXPIRES_IN') ?? '30d',
    });
    return { accessToken, refreshToken, user: payload };
  }
}
