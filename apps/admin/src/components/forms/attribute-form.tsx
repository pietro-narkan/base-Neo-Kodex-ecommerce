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
import { apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Attribute {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  initial?: Attribute;
}

export function AttributeForm({ initial }: Props) {
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
      ? { name: initial.name, slug: initial.slug }
      : { name: '', slug: '' },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug?.trim() || undefined,
      };
      if (initial) {
        await apiPatch(`/admin/attributes/${initial.id}`, payload);
        router.push('/attributes');
        router.refresh();
      } else {
        const attr = await apiPost<Attribute>('/admin/attributes', payload);
        // Redirect a edit page para que el admin agregue values
        router.push(`/attributes/${attr.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej: Color, Talla, Material"
        />
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

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {initial ? 'Guardar cambios' : 'Crear atributo'}
        </Button>
        <Link
          href="/attributes"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
