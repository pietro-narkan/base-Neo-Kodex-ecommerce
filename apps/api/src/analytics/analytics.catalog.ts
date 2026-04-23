/**
 * Catálogo de herramientas de analítica que pueden configurarse desde
 * /admin/analytics. Cada herramienta guarda en Setting el snippet que el
 * proveedor entrega — se inyecta tal cual en el storefront público.
 *
 * Los ADMINs son los únicos que pueden editar esto (mismo nivel que Settings).
 * El endpoint público /public/analytics expone SOLO el contenido ya habilitado,
 * sin ningún dato sensible — el snippet es 100% client-side y lo ve cualquiera
 * que abra el código fuente del sitio.
 */

export interface AnalyticsToolDefinition {
  id: string;
  label: string;
  description: string;
  /** URL de referencia para que el admin sepa de dónde copiar el código. */
  docsUrl: string;
  /** Si la herramienta necesita un bloque HTML extra (noscript) en el <body>. */
  hasBodySnippet: boolean;
  /** Ayuda en pantalla sobre dónde se inyecta cada pedazo. */
  headHint: string;
  bodyHint?: string;
}

const GOOGLE_ANALYTICS: AnalyticsToolDefinition = {
  id: 'google_analytics',
  label: 'Google Analytics (GA4)',
  description:
    'Tracking de pageviews y eventos con la propiedad GA4 (ID tipo G-XXXXXXXXXX).',
  docsUrl: 'https://support.google.com/analytics/answer/9539598',
  hasBodySnippet: false,
  headHint:
    'Pegá el snippet completo tal como lo entrega Google: incluye el <script async src="...gtag/js..."> + el <script> inline con gtag("config", ...).',
};

const GOOGLE_TAG_MANAGER: AnalyticsToolDefinition = {
  id: 'google_tag_manager',
  label: 'Google Tag Manager',
  description:
    'Gestor de tags. Útil si ya usás GTM para disparar GA, Meta, conversiones, etc. desde un solo lugar.',
  docsUrl: 'https://developers.google.com/tag-platform/tag-manager/web',
  hasBodySnippet: true,
  headHint:
    'Pegá el <script>(function(w,d,s,l,i){...})</script> que GTM te da para el <head>.',
  bodyHint:
    'Pegá el <noscript><iframe ...></iframe></noscript> que GTM te da para poner después de la apertura de <body>.',
};

const META_PIXEL: AnalyticsToolDefinition = {
  id: 'meta_pixel',
  label: 'Meta Pixel (Facebook / Instagram)',
  description:
    'Pixel de Meta para trackear conversiones y construir audiencias en Facebook/Instagram Ads.',
  docsUrl:
    'https://www.facebook.com/business/help/952192354843755?id=1205376682832142',
  hasBodySnippet: true,
  headHint:
    'Pegá el <script>!function(f,b,e,v,n,t,s){...}; fbq("init","..."); fbq("track","PageView");</script>.',
  bodyHint:
    'Pegá el <noscript><img height="1" width="1" src="https://www.facebook.com/tr?id=..."/></noscript> (fallback sin JS).',
};

const MICROSOFT_CLARITY: AnalyticsToolDefinition = {
  id: 'microsoft_clarity',
  label: 'Microsoft Clarity',
  description:
    'Grabaciones de sesión y heatmaps gratuitos. Útil para entender cómo interactúan los visitantes con el sitio.',
  docsUrl: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup',
  hasBodySnippet: false,
  headHint:
    'Pegá el <script> que te da Clarity (empieza con (function(c,l,a,r,i,t,y){...}) e incluye tu project ID).',
};

export const ANALYTICS_TOOLS: readonly AnalyticsToolDefinition[] = [
  GOOGLE_ANALYTICS,
  GOOGLE_TAG_MANAGER,
  META_PIXEL,
  MICROSOFT_CLARITY,
] as const;

export type AnalyticsToolId = (typeof ANALYTICS_TOOLS)[number]['id'];

export function findAnalyticsTool(id: string): AnalyticsToolDefinition | undefined {
  return ANALYTICS_TOOLS.find((t) => t.id === id);
}

export function settingKeyForAnalytics(id: string): string {
  return `analytics.${id}`;
}

export const ANALYTICS_SETTING_PREFIX = 'analytics.';

export interface StoredAnalyticsConfig {
  enabled: boolean;
  headHtml: string;
  bodyHtml: string;
}

export function emptyConfig(): StoredAnalyticsConfig {
  return { enabled: false, headHtml: '', bodyHtml: '' };
}

export function isStoredAnalyticsConfig(
  value: unknown,
): value is StoredAnalyticsConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.enabled === 'boolean' &&
    typeof v.headHtml === 'string' &&
    typeof v.bodyHtml === 'string'
  );
}
