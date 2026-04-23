import type { AdminRole } from '@prisma/client';

export type UserType = 'admin' | 'customer';

export interface JwtPayload {
  sub: string;
  type: UserType;
  email: string;
  // Only present for type === 'admin'. Informational for the UI; RolesGuard
  // always re-queries the DB, so a stale role can't grant privileges after
  // being demoted. It just means the UI might briefly show admin-only
  // buttons to a demoted admin until they re-login.
  role?: AdminRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: JwtPayload;
}
