import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth';

import './globals.css';

export const metadata: Metadata = {
  title: 'Neo-Kodex Admin',
  description: 'Panel de administración',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
