'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { api, apiPost, clearTokens, setTokens } from './api';
import { getCartSession } from './cart-session';

export interface CustomerUser {
  sub: string;
  type: 'customer' | 'admin';
  email: string;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  rut?: string;
}

interface AuthContextValue {
  user: CustomerUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: CustomerUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<CustomerUser>('/auth/me');
        // Storefront solo acepta clientes (si alguien tiene token admin, ignoramos)
        if (me.type === 'customer') {
          setUser(me);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const mergeGuestCart = useCallback(async () => {
    const sid = getCartSession();
    if (!sid) return;
    try {
      await apiPost('/cart/merge', { sessionId: sid });
    } catch {
      // No crítico si falla
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiPost<LoginResponse>('/auth/customer/login', {
        email,
        password,
      });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      await mergeGuestCart();
    },
    [mergeGuestCart],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const data = await apiPost<LoginResponse>(
        '/auth/customer/register',
        input,
      );
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      await mergeGuestCart();
    },
    [mergeGuestCart],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
