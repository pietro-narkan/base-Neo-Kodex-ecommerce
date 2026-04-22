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
import { Select } from '@/components/ui/select';
import { apiPatch, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  code: z.string().min(2).transform((v) => v.toUpperCase().trim()),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.coerce.number().int().min(1),
  minOrderAmount: z.coerce.number().int().min(0).optional(),
  maxUses: z.coerce.number().int().min(1).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

interface Props {
  initial?: Coupon;
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.substring(0, 10);
}

export function CouponForm({ initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          code: initial.code,
          type: initial.type,
          value: initial.value,
          minOrderAmount: initial.minOrderAmount ?? undefined,
          maxUses: initial.maxUses ?? undefined,
          validFrom: toDateInputValue(initial.validFrom),
          validUntil: toDateInputValue(initial.validUntil),
          active: initial.active,
        }
      : {
          code: '',
          type: 'PERCENTAGE',
          value: 10,
          active: true,
        },
  });

  const type = watch('type');

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        code: data.code,
        type: data.type,
        value: data.value,
        minOrderAmount: data.minOrderAmount || undefined,
        maxUses: data.maxUses || undefined,
        validFrom: data.validFrom || undefined,
        validUntil: data.validUntil || undefined,
        active: data.active,
      };
      if (initial) {
        const { code: _ignore, ...rest } = payload;
        void _ignore;
        await apiPatch(`/admin/coupons/${initial.id}`, rest);
      } else {
        await apiPost('/admin/coupons', payload);
      }
      router.push('/coupons');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            className="font-mono uppercase"
            {...register('code')}
            disabled={!!initial}
            placeholder="BIENVENIDA10"
          />
          {errors.code && (
            <p className="text-xs text-destructive">{errors.code.message}</p>
          )}
          {initial && (
            <p className="text-xs text-muted-foreground">
              El código no se puede modificar.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Tipo</Label>
          <Select id="type" {...register('type')}>
            <option value="PERCENTAGE">Porcentaje (%)</option>
            <option value="FIXED">Monto fijo (CLP)</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="value">
            Valor {type === 'PERCENTAGE' ? '(%)' : '(CLP)'}
          </Label>
          <Input
            id="value"
            type="number"
            min={1}
            max={type === 'PERCENTAGE' ? 100 : undefined}
            {...register('value')}
          />
          {errors.value && (
            <p className="text-xs text-destructive">{errors.value.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="minOrderAmount">Monto mínimo de orden (CLP)</Label>
          <Input
            id="minOrderAmount"
            type="number"
            min={0}
            {...register('minOrderAmount')}
            placeholder="Sin mínimo"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxUses">Usos máximos</Label>
          <Input
            id="maxUses"
            type="number"
            min={1}
            {...register('maxUses')}
            placeholder="Ilimitado"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validFrom">Válido desde</Label>
          <Input id="validFrom" type="date" {...register('validFrom')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validUntil">Válido hasta</Label>
          <Input id="validUntil" type="date" {...register('validUntil')} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="active"
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          {...register('active')}
        />
        <Label htmlFor="active" className="cursor-pointer">
          Activo
        </Label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {initial ? 'Guardar cambios' : 'Crear cupón'}
        </Button>
        <Link
          href="/coupons"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
