'use client';

import { Loader2 } from 'lucide-react';
import { use, useEffect, useState } from 'react';

import { CouponForm } from '@/components/forms/coupon-form';
import { apiGet } from '@/lib/api';

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

export default function EditCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Coupon>(`/admin/coupons/${id}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar cupón</h1>
        {data && (
          <p className="text-sm text-muted-foreground font-mono">{data.code}</p>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!data && !error ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <CouponForm initial={data} />
      ) : null}
    </div>
  );
}
