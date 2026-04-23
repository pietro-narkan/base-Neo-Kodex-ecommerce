import { getApiUrl } from './seo';

export interface AnalyticsSnippets {
  head: string[];
  body: string[];
}

/**
 * Lee los snippets de tracking configurados en /admin/analytics.
 * Fetch server-side, con revalidación corta para que los cambios del admin
 * se reflejen rápido sin martillar la DB en cada request. Falla silenciosa:
 * si el API está caído no rompemos el render del layout.
 */
export async function getAnalyticsSnippets(): Promise<AnalyticsSnippets> {
  try {
    const res = await fetch(`${getApiUrl()}/public/analytics`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { head: [], body: [] };
    const data = (await res.json()) as Partial<AnalyticsSnippets>;
    return {
      head: Array.isArray(data.head) ? data.head : [],
      body: Array.isArray(data.body) ? data.body : [],
    };
  } catch {
    return { head: [], body: [] };
  }
}
