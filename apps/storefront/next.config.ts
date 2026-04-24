import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const MINIO_URL = process.env.NEXT_PUBLIC_MINIO_URL ?? 'http://localhost:9000';

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const apiOrigin = originOf(API_URL);
const minioOrigin = originOf(MINIO_URL);

const isDev = process.env.NODE_ENV !== 'production';
// Dominios oficiales de Transbank a los que el storefront debe poder hacer
// submit del form de pago (token_ws). webpay3gint = integración, webpay3g = prod.
const TRANSBANK_FORM_TARGETS =
  'https://webpay3gint.transbank.cl https://webpay3g.transbank.cl';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${minioOrigin ? ` ${minioOrigin}` : ''}`,
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}${isDev ? ' ws: wss:' : ''}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${TRANSBANK_FORM_TARGETS}`,
  "frame-ancestors 'none'",
]
  .filter(Boolean)
  .join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@neo-kodex/types', '@neo-kodex/config'],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.sslip.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.sslip.io',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
