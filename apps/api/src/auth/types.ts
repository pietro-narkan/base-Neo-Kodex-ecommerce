export type UserType = 'admin' | 'customer';

export interface JwtPayload {
  sub: string;
  type: UserType;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: JwtPayload;
}
