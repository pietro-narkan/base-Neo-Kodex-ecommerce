import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';

/**
 * robots.txt generado por Next.js en runtime.
 * Bloquea rutas privadas (checkout, carrito, cuenta) para que Google no
 * las indexe aunque por casualidad alguien las linkee públicamente.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/checkout', '/carrito', '/cuenta', '/login', '/registro'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
