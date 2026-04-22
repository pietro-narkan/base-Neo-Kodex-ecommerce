'use client';

import { use } from 'react';

import { VariantForm } from '@/components/forms/variant-form';

export default function NewVariantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nueva variante
        </h1>
        <p className="text-sm text-muted-foreground">
          El precio bruto se calcula automáticamente desde el neto usando el IVA
          configurado.
        </p>
      </div>
      <VariantForm productId={id} />
    </div>
  );
}
