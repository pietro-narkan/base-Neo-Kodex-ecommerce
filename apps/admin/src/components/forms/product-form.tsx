'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  shortDesc: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  featured: z.boolean(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  shortDesc?: string | null;
  categoryId?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  featured: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface Props {
  initial?: Product;
}

export function ProductForm({ initial }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ data: Category[] }>('/admin/categories?limit=100')
      .then((r) => setCategories(r.data))
      .catch(() => setCategories([]));
  }, []);

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
          shortDesc: initial.shortDesc ?? '',
          description: initial.description ?? '',
          categoryId: initial.categoryId ?? '',
          status: initial.status,
          featured: initial.featured,
          metaTitle: initial.metaTitle ?? '',
          metaDescription: initial.metaDescription ?? '',
        }
      : {
          name: '',
          slug: '',
          shortDesc: '',
          description: '',
          categoryId: '',
          status: 'DRAFT',
          featured: false,
          metaTitle: '',
          metaDescription: '',
        },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug?.trim() || undefined,
        shortDesc: data.shortDesc?.trim() || undefined,
        description: data.description?.trim() || undefined,
        categoryId: data.categoryId || undefined,
        status: data.status,
        featured: data.featured,
        metaTitle: data.metaTitle?.trim() || undefined,
        metaDescription: data.metaDescription?.trim() || undefined,
      };
      if (initial) {
        await apiPatch(`/admin/products/${initial.id}`, payload);
        router.refresh();
      } else {
        const product = await apiPost<Product>('/admin/products', payload);
        router.push(`/products/${product.id}`);
        return;
      }
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register('name')} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" {...register('slug')} placeholder="Auto desde nombre" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shortDesc">Descripción corta</Label>
        <Input
          id="shortDesc"
          {...register('shortDesc')}
          placeholder="Ej: Mesa de madera maciza"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" {...register('description')} rows={5} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          <Select id="categoryId" {...register('categoryId')}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select id="status" {...register('status')}>
            <option value="DRAFT">Borrador (invisible en tienda)</option>
            <option value="ACTIVE">Activo (visible y comprable)</option>
            <option value="ARCHIVED">Archivado (oculto, se conserva)</option>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            {...register('featured')}
          />
          <span className="text-sm">Destacado</span>
        </label>
      </div>

      <details className="border rounded-md p-4">
        <summary className="cursor-pointer text-sm font-medium">
          SEO (opcional)
        </summary>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="metaTitle">Meta title</Label>
            <Input id="metaTitle" {...register('metaTitle')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaDescription">Meta description</Label>
            <Textarea
              id="metaDescription"
              {...register('metaDescription')}
              rows={2}
            />
          </div>
        </div>
      </details>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {initial ? 'Guardar cambios' : 'Crear producto'}
        </Button>
        <Link
          href="/products"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
