'use client';

import { ShoppingCart, User } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';

export function Header() {
  const { user } = useAuth();
  const { count } = useCart();

  return (
    <header className="border-b bg-background sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          Neo-Kodex
        </Link>

        <nav className="hidden sm:flex items-center gap-6">
          <Link
            href="/productos"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Productos
          </Link>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/carrito"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'relative',
            )}
            aria-label="Carrito"
          >
            <ShoppingCart className="size-5" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center px-1">
                {count}
              </span>
            )}
          </Link>

          {user ? (
            <Link
              href="/cuenta"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              <User className="size-4" />
              <span className="hidden sm:inline">Mi cuenta</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
