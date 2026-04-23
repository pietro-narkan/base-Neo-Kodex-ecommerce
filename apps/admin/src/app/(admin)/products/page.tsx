'use client';

import { Loader2, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiDelete, apiGet } from '@/lib/api';
import { cn, formatCLP } from '@/lib/utils';

interface Variant {
  id: string;
  priceGross: number;
  stock: number;
  active: boolean;
}

interface Category {
  id: string;
  name: string;
}

type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

interface Product {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  status: ProductStatus;
  deletedAt: string | null;
  featured: boolean;
  category: Category | null;
  variants: Variant[];
  createdAt: string;
}

const statusLabels: Record<ProductStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  ARCHIVED: 'Archivado',
};

function priceRange(variants: Variant[]): string {
  if (variants.length === 0) return '—';
  const prices = variants.map((v) => v.priceGross);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCLP(min) : `${formatCLP(min)} – ${formatCLP(max)}`;
}

function totalStock(variants: Variant[]): number {
  return variants.reduce((s, v) => s + v.stock, 0);
}

export default function ProductsListPage() {
  const [data, setData] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<{ data: Product[] }>(
        '/admin/products?limit=100',
      );
      setData(res.data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"? Esto borra también sus variantes.`)) return;
    try {
      await apiDelete(`/admin/products/${id}`);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona el catálogo. Las variantes y media se editan dentro de cada producto.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/products/import"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            <Upload className="size-4" />
            Importar productos
          </Link>
          <Link href="/products/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            Nuevo producto
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No hay productos todavía.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Variantes</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Stock total</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {p.featured && (
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {p.slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.category?.name ?? '—'}
                  </TableCell>
                  <TableCell>{p.variants.length}</TableCell>
                  <TableCell>{priceRange(p.variants)}</TableCell>
                  <TableCell>{totalStock(p.variants)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.status === 'ACTIVE'
                          ? 'success'
                          : p.status === 'DRAFT'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {statusLabels[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link
                      href={`/products/${p.id}`}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' }),
                      )}
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(p.id, p.name)}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
