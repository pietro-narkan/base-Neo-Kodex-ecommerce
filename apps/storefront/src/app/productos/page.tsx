'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ProductCard, type ProductCardData } from '@/components/product-card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiGet } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function ProductsListPage() {
  const [products, setProducts] = useState<ProductCardData[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Category[] }>('/categories')
      .then((r) => setCategories(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setProducts(null);
    setError(null);
    const q = categoryId ? `&categoryId=${categoryId}` : '';
    apiGet<{ data: ProductCardData[] }>(`/products?limit=60${q}`)
      .then((r) => setProducts(r.data))
      .catch((err) => {
        setProducts([]);
        setError((err as Error).message);
      });
  }, [categoryId]);

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {products === null
              ? 'Cargando catálogo…'
              : `${products.length} producto${products.length === 1 ? '' : 's'} disponible${products.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {products === null ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="hidden" />
          No hay productos en esta categoría.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
