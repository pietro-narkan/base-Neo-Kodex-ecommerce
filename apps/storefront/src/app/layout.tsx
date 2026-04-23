import type { Metadata } from 'next';

import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
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
