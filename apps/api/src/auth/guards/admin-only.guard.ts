import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app-exception';
import { ErrorCodes } from '../../common/errors/codes';
import type { JwtPayload } from '../types';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user || req.user.type !== 'admin') {
      throw new AppException(
        ErrorCodes.AUTH_FORBIDDEN,
        'Requiere permisos de admin',
        403,
      );
    }
    return true;
  }
}
