import type { MetadataRoute } from 'next';

import { absoluteUrl, getApiUrl } from '@/lib/seo';

interface Product {
  slug: string;
  updatedAt: string;
}

interface Category {
  slug: string;
  updatedAt: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
}

/**
 * sitemap.xml generado server-side al request. Incluye:
 * - Home + páginas estáticas
 * - Todas las categorías activas
 * - Todos los productos activos
 *
 * Revalidate cada hora para que cambios de catálogo se reflejen sin build.
 */
export const revalidate = 3600;

async function fetchAllProducts(): Promise<Product[]> {
  const api = getApiUrl();
  // Paginamos 200 por página hasta agotar.
  const out: Product[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await fetch(`${api}/products?page=${page}&limit=100`, {
      next: { revalidate: 3600 },
    }).catch(() => null);
    if (!res || !res.ok) break;
    const body = (await res.json()) as Paginated<Product>;
    out.push(...body.data);
    if (body.data.length < 100) break;
  }
  return out;
}

async function fetchAllCategories(): Promise<Category[]> {
  const api = getApiUrl();
  const res = await fetch(`${api}/categories?limit=100`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const body = (await res.json()) as Paginated<Category>;
  return body.data;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    fetchAllProducts(),
    fetchAllCategories(),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/productos'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: absoluteUrl(`/categoria/${c.slug}`),
    lastModified: new Date(c.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: absoluteUrl(`/productos/${p.slug}`),
    lastModified: new Date(p.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
