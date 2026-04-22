'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  sku: z.string().min(1, 'Requerido'),
  name: z.string().optional(),
  priceNet: z.coerce.number().int().min(0),
  compareAtPrice: z.coerce.number().int().min(0).optional(),
  stock: z.coerce.number().int().min(0),
  weightGrams: z.coerce.number().int().min(0).optional(),
  lengthCm: z.coerce.number().int().min(0).optional(),
  widthCm: z.coerce.number().int().min(0).optional(),
  heightCm: z.coerce.number().int().min(0).optional(),
  active: z.boolean(),
  attributeValueIds: z.array(z.string()),
});

type FormData = z.infer<typeof schema>;

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

export interface Variant {
  id: string;
  sku: string;
  name: string | null;
  priceNet: number;
  compareAtPrice: number | null;
  stock: number;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  active: boolean;
  attributes: Array<{ attributeValue: { id: string } }>;
}

interface Props {
  productId: string;
  initial?: Variant;
}

export function VariantForm({ productId, initial }: Props) {
  const router = useRouter();
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ data: Attribute[] }>('/admin/attributes?limit=100')
      .then((r) => setAttributes(r.data))
      .catch(() => setAttributes([]));
  }, []);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          sku: initial.sku,
          name: initial.name ?? '',
          priceNet: initial.priceNet,
          compareAtPrice: initial.compareAtPrice ?? undefined,
          stock: initial.stock,
          weightGrams: initial.weightGrams ?? undefined,
          lengthCm: initial.lengthCm ?? undefined,
          widthCm: initial.widthCm ?? undefined,
          heightCm: initial.heightCm ?? undefined,
          active: initial.active,
          attributeValueIds: initial.attributes.map((a) => a.attributeValue.id),
        }
      : {
          sku: '',
          name: '',
          priceNet: 0,
          stock: 0,
          active: true,
          attributeValueIds: [],
        },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        sku: data.sku,
        name: data.name?.trim() || undefined,
        priceNet: data.priceNet,
        compareAtPrice: data.compareAtPrice || undefined,
        stock: data.stock,
        weightGrams: data.weightGrams || undefined,
        lengthCm: data.lengthCm || undefined,
        widthCm: data.widthCm || undefined,
        heightCm: data.heightCm || undefined,
        active: data.active,
        attributeValueIds:
          data.attributeValueIds.length > 0
            ? data.attributeValueIds
            : undefined,
      };
      if (initial) {
        await apiPatch(`/admin/variants/${initial.id}`, payload);
      } else {
        await apiPost(`/admin/products/${productId}/variants`, payload);
      }
      router.push(`/products/${productId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" className="font-mono" {...register('sku')} />
          {errors.sku && (
            <p className="text-xs text-destructive">{errors.sku.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nombre de la variante (opcional)</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="Ej: Mesa roja grande"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priceNet">Precio neto (CLP)</Label>
          <Input
            id="priceNet"
            type="number"
            min={0}
            {...register('priceNet')}
          />
          <p className="text-xs text-muted-foreground">
            El bruto con IVA se calcula automáticamente.
          </p>
          {errors.priceNet && (
            <p className="text-xs text-destructive">
              {errors.priceNet.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="compareAtPrice">Precio tachado (CLP)</Label>
          <Input
            id="compareAtPrice"
            type="number"
            min={0}
            {...register('compareAtPrice')}
            placeholder="Precio antes del descuento"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock">Stock</Label>
          <Input id="stock" type="number" min={0} {...register('stock')} />
          {errors.stock && (
            <p className="text-xs text-destructive">{errors.stock.message}</p>
          )}
        </div>
      </div>

      <details className="border rounded-md p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Logística (peso y dimensiones)
        </summary>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="weightGrams">Peso (g)</Label>
            <Input
              id="weightGrams"
              type="number"
              min={0}
              {...register('weightGrams')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lengthCm">Largo (cm)</Label>
            <Input
              id="lengthCm"
              type="number"
              min={0}
              {...register('lengthCm')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widthCm">Ancho (cm)</Label>
            <Input
              id="widthCm"
              type="number"
              min={0}
              {...register('widthCm')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heightCm">Alto (cm)</Label>
            <Input
              id="heightCm"
              type="number"
              min={0}
              {...register('heightCm')}
            />
          </div>
        </div>
      </details>

      {attributes.length > 0 && (
        <div className="space-y-3 border rounded-md p-4">
          <div>
            <Label className="text-sm font-medium">
              Atributos de la variante
            </Label>
            <p className="text-xs text-muted-foreground">
              Marcá los valores que aplican (ej: Color=Rojo, Talla=M).
            </p>
          </div>
          <Controller
            control={control}
            name="attributeValueIds"
            render={({ field }) => (
              <div className="space-y-3">
                {attributes.map((attr) => (
                  <div key={attr.id}>
                    <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      {attr.name}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {attr.values.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          Sin valores. Agregalos en el atributo.
                        </span>
                      ) : (
                        attr.values.map((v) => {
                          const checked = field.value.includes(v.id);
                          return (
                            <label
                              key={v.id}
                              className={cn(
                                'inline-flex items-center gap-2 cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
                                checked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'hover:bg-accent',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    field.onChange([...field.value, v.id]);
                                  } else {
                                    field.onChange(
                                      field.value.filter(
                                        (id: string) => id !== v.id,
                                      ),
                                    );
                                  }
                                }}
                              />
                              {v.value}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          />
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          {...register('active')}
        />
        <span className="text-sm">Variante activa</span>
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {initial ? 'Guardar cambios' : 'Crear variante'}
        </Button>
        <Link
          href={`/products/${productId}`}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
