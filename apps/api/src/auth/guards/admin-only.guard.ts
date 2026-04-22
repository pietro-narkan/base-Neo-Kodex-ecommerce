import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { JwtPayload } from '../types';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user || req.user.type !== 'admin') {
      throw new ForbiddenException('Requiere permisos de admin');
    }
    return true;
  }
}
