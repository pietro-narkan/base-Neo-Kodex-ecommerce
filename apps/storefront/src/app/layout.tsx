import type { Metadata } from 'next';

import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { getAnalyticsSnippets } from '@/lib/analytics';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { getSiteName, getSiteUrl } from '@/lib/seo';

import './globals.css';

const siteUrl = getSiteUrl();
const siteName = getSiteName();
const defaultDescription =
  'Compra online con entrega a todo Chile. Productos seleccionados, pagos seguros y envío a tu casa.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  applicationName: siteName,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName,
    locale: 'es_CL',
    url: siteUrl,
    title: siteName,
    description: defaultDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: defaultDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const analytics = await getAnalyticsSnippets();

  return (
    <html lang="es">
      <body>
        {/*
          Scripts de analytics inyectados server-side. Como el HTML llega al
          browser como parte de la respuesta inicial, el parser sí ejecuta los
          <script> que contiene (no aplica la restricción de innerHTML).
          Los "head" van primero para que los trackers se carguen cuanto antes;
          los "body" (noscript de GTM/Meta) van después como fallback sin JS.
        */}
        {analytics.head.map((html, i) => (
          <div
            key={`analytics-head-${i}`}
            data-analytics="head"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ))}
        {analytics.body.map((html, i) => (
          <div
            key={`analytics-body-${i}`}
            data-analytics="body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ))}
        <AuthProvider>
          <CartProvider>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
