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

interface AttributeValue {
  id: string;
  value: string;
  slug: string;
}

interface Attribute {
  id: string;
  name: string;
  slug: string;
  values: AttributeValue[];
}

export default function AttributesListPage() {
  const [data, setData] = useState<Attribute[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<{ data: Attribute[] }>(
        '/admin/attributes?limit=100',
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
    if (!window.confirm(`¿Eliminar el atributo "${name}"? Esto borra también sus valores.`)) return;
    try {
      await apiDelete(`/admin/attributes/${id}`);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atributos</h1>
          <p className="text-sm text-muted-foreground">
            Atributos variables de productos (color, talla, material, etc.).
          </p>
        </div>
        <Link href="/attributes/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          Nuevo atributo
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
          No hay atributos todavía.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Valores</TableHead>
                <TableHead className="w-32 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {a.slug}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {a.values.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          sin valores
                        </span>
                      ) : (
                        a.values.map((v) => (
                          <Badge key={v.id} variant="secondary">
                            {v.value}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link
                      href={`/attributes/${a.id}`}
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
                      onClick={() => handleDelete(a.id, a.name)}
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
