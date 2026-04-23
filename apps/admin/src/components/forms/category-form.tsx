'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  order: z.coerce.number().int().min(0),
  active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  order: number;
  active: boolean;
}

interface Props {
  initial?: Category;
}

/**
 * Builds a flat, indented list of categories in tree order.
 * Used for the parent dropdown so the admin sees the hierarchy.
 * Returns a map: id → {displayName (with indent), depth}.
 */
function buildIndentedList(
  categories: Category[],
): Array<{ id: string; label: string; depth: number }> {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  const out: Array<{ id: string; label: string; depth: number }> = [];
  function walk(parentId: string | null, depth: number): void {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      out.push({
        id: c.id,
        label: `${'— '.repeat(depth)}${c.name}`,
        depth,
      });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

/** Returns the set of descendants of `rootId` (not including rootId itself). */
function descendantsOf(categories: Category[], rootId: string): Set<string> {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const k = c.parentId ?? null;
    const list = byParent.get(k) ?? [];
    list.push(c);
    byParent.set(k, list);
  }
  const out = new Set<string>();
  function walk(id: string): void {
    const kids = byParent.get(id) ?? [];
    for (const k of kids) {
      if (!out.has(k.id)) {
        out.add(k.id);
        walk(k.id);
      }
    }
  }
  walk(rootId);
  return out;
}

export function CategoryForm({ initial }: Props) {
  const router = useRouter();
  const [all, setAll] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ data: Category[] }>('/admin/categories?limit=100')
      .then((r) => setAll(r.data))
      .catch(() => setAll([]));
  }, []);

  const parentOptions = useMemo(() => {
    const invalidIds = new Set<string>();
    if (initial) {
      invalidIds.add(initial.id);
      for (const d of descendantsOf(all, initial.id)) invalidIds.add(d);
    }
    return buildIndentedList(all).filter((o) => !invalidIds.has(o.id));
  }, [all, initial]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          name: initial.name,
          slug: initial.slug,
          description: initial.description ?? '',
          parentId: initial.parentId ?? '',
          order: initial.order,
          active: initial.active,
        }
      : {
          name: '',
          slug: '',
          description: '',
          parentId: '',
          order: 0,
          active: true,
        },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug?.trim() || undefined,
        description: data.description?.trim() || undefined,
        parentId: data.parentId && data.parentId.length > 0 ? data.parentId : null,
        order: data.order,
        active: data.active,
      };
      if (initial) {
        await apiPatch(`/admin/categories/${initial.id}`, payload);
      } else {
        await apiPost('/admin/categories', payload);
      }
      router.push('/categories');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" {...register('name')} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          {...register('slug')}
          placeholder="Se autogenera desde el nombre si lo dejás vacío"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="parentId">Categoría padre</Label>
        <Select id="parentId" {...register('parentId')}>
          <option value="">— Sin padre (categoría raíz) —</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Dejá vacío para que sea una categoría de primer nivel. Subcategorías
          aparecen anidadas abajo de la elegida.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" {...register('description')} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="order">Orden</Label>
          <Input id="order" type="number" min={0} {...register('order')} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            id="active"
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            {...register('active')}
          />
          <Label htmlFor="active" className="cursor-pointer">
            Activa
          </Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {initial ? 'Guardar cambios' : 'Crear categoría'}
        </Button>
        <Link
          href="/categories"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
