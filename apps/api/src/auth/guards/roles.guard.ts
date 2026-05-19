import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';

import { AppException } from '../../common/errors/app-exception';
import { ErrorCodes } from '../../common/errors/codes';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../types';

export const ROLES_META_KEY = 'requiredRoles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(
      ROLES_META_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No decorator applied → permissive (any active admin passes AdminOnlyGuard).
    if (required === undefined) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user || user.type !== 'admin') {
      throw new AppException(
        ErrorCodes.AUTH_FORBIDDEN,
        'Requiere autenticación de admin',
        403,
      );
    }

    const admin = await this.prisma.admin.findUnique({
      where: { id: user.sub },
      select: { role: true, active: true },
    });
    if (!admin || !admin.active) {
      throw new AppException(
        ErrorCodes.AUTH_FORBIDDEN,
        'Admin inválido o desactivado',
        403,
      );
    }

    // Super ADMIN always passes.
    if (admin.role === 'ADMIN') return true;

    // Empty @RequireRoles() means "super ADMIN only".
    if (required.length === 0) {
      throw new AppException(
        ErrorCodes.AUTH_FORBIDDEN,
        'Requiere permisos de super ADMIN',
        403,
      );
    }
    if (!required.includes(admin.role)) {
      throw new AppException(
        ErrorCodes.AUTH_FORBIDDEN,
        'Permisos insuficientes para esta acción',
        403,
      );
    }
    return true;
  }
}
