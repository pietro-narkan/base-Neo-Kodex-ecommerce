'use client';

import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  parentId: string | null;
  active: boolean;
  order: number;
  createdAt: string;
}

interface FlatNode extends Category {
  depth: number;
}

/** Sort children in display order; depth-first to preserve parent→child rows. */
function buildTreeRows(categories: Category[]): FlatNode[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const k = c.parentId ?? null;
    const list = byParent.get(k) ?? [];
    list.push(c);
    byParent.set(k, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  const out: FlatNode[] = [];
  function walk(parentId: string | null, depth: number): void {
    const kids = byParent.get(parentId) ?? [];
    for (const c of kids) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  // Surface orphans (bad data: parentId referencing non-existent category) at root
  const ids = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    if (c.parentId && !ids.has(c.parentId) && !out.find((r) => r.id === c.id)) {
      out.push({ ...c, depth: 0 });
    }
  }
  return out;
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

  const rows = useMemo(() => (data ? buildTreeRows(data) : []), [data]);

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
            Árbol de categorías. Las subcategorías se anidan bajo su categoría padre.
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
      ) : rows.length === 0 ? (
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
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      {c.depth > 0 && (
                        <span
                          className="text-muted-foreground/60 select-none"
                          style={{ paddingLeft: `${(c.depth - 1) * 16}px` }}
                          aria-hidden
                        >
                          └─{'─'.repeat(Math.max(0, c.depth - 1))}{' '}
                        </span>
                      )}
                      {c.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
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
