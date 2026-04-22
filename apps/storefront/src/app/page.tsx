'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ProductCard, type ProductCardData } from '@/components/product-card';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const [products, setProducts] = useState<ProductCardData[] | null>(null);

  useEffect(() => {
    apiGet<{ data: ProductCardData[] }>('/products?featured=true&limit=8')
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]));
  }, []);

  return (
    <>
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Bienvenido a Neo-Kodex
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Descubrí nuestros productos destacados.
          </p>
          <div className="mt-8">
            <Link
              href="/productos"
              className={cn(buttonVariants({ size: 'lg' }))}
            >
              Ver catálogo
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Destacados</h2>
          <Link
            href="/productos"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver todo →
          </Link>
        </div>

        {products === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground">
            No hay productos destacados todavía.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
