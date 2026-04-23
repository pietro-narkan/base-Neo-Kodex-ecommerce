'use client';

import { ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  slug: string;
  deletedAt: string;
  category: { id: string; name: string } | null;
  variants: Array<{ sku: string }>;
}

export default function TrashPage() {
  const [data, setData] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<{ data: Product[]; total: number }>(
        '/admin/products/trash?limit=100',
      );
      setData(res.data);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    setSelected(selected.size === data.length ? new Set() : new Set(data.map((p) => p.id)));
  }

  async function bulkRestore() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await apiPost('/admin/products/bulk', { ids, action: 'restore' });
      setNotice(`${ids.length} producto(s) restaurado(s) a ARCHIVED. Podés reactivarlos desde la lista.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function purgeOne(id: string, name: string) {
    if (!window.confirm(`¿Eliminar DEFINITIVAMENTE "${name}"? No se puede deshacer.`)) return;
    setBusy(true);
    try {
      await apiDelete(`/admin/products/${id}/purge`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function emptyTrash() {
    if (
      !window.confirm(
        `¿Vaciar la papelera? Esto eliminará DEFINITIVAMENTE los ${data?.length ?? 0} productos. No se puede deshacer.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await apiPost<{ count: number }>('/admin/products/trash/empty', {});
      setNotice(`${res.count} producto(s) eliminado(s) permanentemente.`);
      setTimeout(() => setNotice(null), 4000);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (data === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver a productos
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Papelera</h1>
          <p className="text-sm text-muted-foreground">
            Productos eliminados. Se borran automáticamente después de N días
            (configurable en{' '}
            <Link href="/settings" className="underline">
              Configuración → Papelera
            </Link>
            ).
          </p>
        </div>
        {data.length > 0 && (
          <Button
            variant="destructive"
            onClick={emptyTrash}
            disabled={busy}
          >
            <Trash2 className="size-4" />
            Vaciar papelera
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">
            {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={bulkRestore}>
            <RotateCcw className="size-4" />
            Restaurar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Deseleccionar
          </Button>
        </div>
      )}

      {data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          La papelera está vacía.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.size === data.length}
                    onChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Variantes</TableHead>
                <TableHead>Eliminado</TableHead>
                <TableHead className="text-right w-40">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{p.name}</span>
                    <div className="text-xs text-muted-foreground font-mono">
                      {p.slug}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.category?.name ?? '—'}
                  </TableCell>
                  <TableCell>{p.variants.length}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(p.deletedAt)}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await apiPost('/admin/products/bulk', {
                            ids: [p.id],
                            action: 'restore',
                          });
                          await load();
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      aria-label="Restaurar"
                      title="Restaurar"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => purgeOne(p.id, p.name)}
                      aria-label="Eliminar permanentemente"
                      title="Eliminar permanentemente"
                    >
                      <Trash2 className="size-4 text-destructive" />
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
