import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { JwtPayload } from '../types';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtPayload | undefined>(
    _err: unknown,
    user: TUser,
  ): TUser {
    // Pasa aunque no haya user: el handler decide qué hacer.
    return (user || undefined) as TUser;
  }
}
