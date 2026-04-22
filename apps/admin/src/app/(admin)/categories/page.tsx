'use client';

import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  order: number;
  createdAt: string;
}

export default function CategoriesListPage() {
  const [data, setData] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<{ data: Category[] }>(
        '/admin/categories?limit=100',
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
    if (!window.confirm(`¿Eliminar categoría "${name}"?`)) return;
    try {
      await apiDelete(`/admin/categories/${id}`);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las categorías del catálogo.
          </p>
        </div>
        <Link href="/categories/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          Nueva categoría
        </Link>
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
          No hay categorías todavía.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="w-24">Orden</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.slug}
                  </TableCell>
                  <TableCell>{c.order}</TableCell>
                  <TableCell>
                    <Badge variant={c.active ? 'success' : 'secondary'}>
                      {c.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link
                      href={`/categories/${c.id}`}
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
                      onClick={() => handleDelete(c.id, c.name)}
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
