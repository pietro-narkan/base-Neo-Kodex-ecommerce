'use client';

import { Loader2 } from 'lucide-react';
import { use, useEffect, useState } from 'react';

import { VariantForm, type Variant } from '@/components/forms/variant-form';
import { apiGet } from '@/lib/api';

export default function EditVariantPage({
  params,
}: {
  params: Promise<{ id: string; variantId: string }>;
}) {
  const { id, variantId } = use(params);
  const [data, setData] = useState<Variant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Variant>(`/admin/variants/${variantId}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [variantId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar variante
        </h1>
        {data && (
          <p className="text-sm text-muted-foreground font-mono">{data.sku}</p>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!data && !error ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <VariantForm productId={id} initial={data} />
      ) : null}
    </div>
  );
}
