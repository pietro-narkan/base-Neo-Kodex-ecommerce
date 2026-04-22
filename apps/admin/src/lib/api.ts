export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const TOKEN_KEY = 'nk_token';
const REFRESH_KEY = 'nk_refresh';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  /** Don't try to refresh token on 401 — used to break recursion */
  noRetry?: boolean;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  // Cookie de sentinel para el middleware (el server no ve localStorage)
  document.cookie = `nk_auth=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  document.cookie = 'nk_auth=; path=/; max-age=0; SameSite=Lax';
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { skipAuth, noRetry, body, ...rest } = options;
  const headers = new Headers(rest.headers);

  if (!skipAuth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const fetchBody =
    body === undefined
      ? undefined
      : isFormData
        ? body
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: fetchBody,
  });

  if (res.status === 401 && !skipAuth && !noRetry) {
    const ok = await refreshAccessToken();
    if (ok) {
      return api<T>(path, { ...options, noRetry: true });
    }
    clearTokens();
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    const message =
      typeof (errBody as { message?: unknown }).message === 'string'
        ? ((errBody as { message: string }).message)
        : Array.isArray((errBody as { message?: unknown }).message)
          ? ((errBody as { message: string[] }).message).join('; ')
          : res.statusText;
    throw new ApiError(res.status, message, errBody);
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export const apiGet = <T>(path: string) => api<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body });
export const apiDelete = <T>(path: string) =>
  api<T>(path, { method: 'DELETE' });
