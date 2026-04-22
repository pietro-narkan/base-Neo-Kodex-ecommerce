'use client';

import { Loader2 } from 'lucide-react';
import { use, useEffect, useState } from 'react';

import { AttributeForm } from '@/components/forms/attribute-form';
import {
  AttributeValuesManager,
  type AttributeValue,
} from '@/components/forms/attribute-values-manager';
import { apiGet } from '@/lib/api';

interface Attribute {
  id: string;
  name: string;
  slug: string;
  values: AttributeValue[];
}

export default function EditAttributePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Attribute | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Attribute>(`/admin/attributes/${id}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar atributo
        </h1>
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.name} ·{' '}
            <span className="font-mono">{data.slug}</span>
          </p>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!data && !error ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <AttributeForm initial={data} />
          <AttributeValuesManager
            attributeId={data.id}
            initialValues={data.values}
          />
        </>
      ) : null}
    </div>
  );
}
