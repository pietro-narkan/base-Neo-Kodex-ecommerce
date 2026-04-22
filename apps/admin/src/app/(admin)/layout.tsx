'use client';

import {
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  ShoppingCart,
  Sliders,
  Tag,
  Ticket,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Órdenes', icon: ShoppingCart },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/categories', label: 'Categorías', icon: Tag },
  { href: '/attributes', label: 'Atributos', icon: Sliders },
  { href: '/coupons', label: 'Cupones', icon: Ticket },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r bg-muted/30 p-3 flex flex-col">
        <div className="px-3 py-3 mb-4">
          <div className="font-semibold text-base">Neo-Kodex</div>
          <div className="text-xs text-muted-foreground">Admin</div>
        </div>
        <nav className="flex-1 space-y-1">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-col min-w-0">
        <header className="border-b h-14 flex items-center justify-end px-6 gap-4 bg-background">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            <LogOut className="size-4" />
            Salir
          </Button>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
