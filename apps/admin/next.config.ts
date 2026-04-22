import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Monorepo: trace root es la raíz del repo para que standalone incluya
  // los workspace deps (packages/types, packages/config).
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
    ],
  },
};

export default nextConfig;
