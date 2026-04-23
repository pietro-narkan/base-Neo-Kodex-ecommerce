// Resolvers para SEO / OG tags. Leen env vars en build time (para metadata
// estática) o request time (para sitemap dinámico).

export function getSiteUrl(): string {
  // En prod, el usuario apunta su dominio via NEXT_PUBLIC_SITE_URL.
  // Fallback a STOREFRONT_URL que Coolify inyecta via magic vars.
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.STOREFRONT_URL ??
    'http://localhost:3002'
  );
}

export function getSiteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME ?? 'Neo-Kodex';
}

export function getApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
  );
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
