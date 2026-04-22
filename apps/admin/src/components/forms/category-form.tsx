'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().optional(),
  description: z.string().optional(),
  order: z.coerce.number().int().min(0),
  active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  order: number;
  active: boolean;
}

interface Props {
  initial?: Category;
}

export function CategoryForm({ initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          order: initial.order,
          active: initial.active,
        }
      : { name: '', slug: '', description: '', order: 0, active: true },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug?.trim() || undefined,
        description: data.description?.trim() || undefined,
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
