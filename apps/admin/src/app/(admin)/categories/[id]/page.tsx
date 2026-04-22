'use client';

import { Loader2 } from 'lucide-react';
import { use, useEffect, useState } from 'react';

import { CategoryForm } from '@/components/forms/category-form';
import { apiGet } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  order: number;
  active: boolean;
}

export default function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Category>(`/admin/categories/${id}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar categoría
        </h1>
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.name} · <span className="font-mono">{data.slug}</span>
          </p>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!data && !error ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <CategoryForm initial={data} />
      ) : null}
    </div>
  );
}
