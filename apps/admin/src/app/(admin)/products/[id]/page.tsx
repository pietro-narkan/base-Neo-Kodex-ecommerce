'use client';

import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import { MediaManager } from '@/components/forms/media-manager';
import { ProductForm } from '@/components/forms/product-form';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiDelete, apiGet } from '@/lib/api';
import { cn, formatCLP } from '@/lib/utils';

interface AttributeValueWithAttr {
  id: string;
  value: string;
  attribute: { name: string };
}

interface VariantAttr {
  attributeValue: AttributeValueWithAttr;
}

interface Variant {
  id: string;
  sku: string;
  name: string | null;
  priceNet: number;
  priceGross: number;
  stock: number;
  active: boolean;
  attributes: VariantAttr[];
}

interface Media {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDesc: string | null;
  categoryId: string | null;
  active: boolean;
  featured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  variants: Variant[];
  media: Media[];
}

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<Product>(`/admin/products/${id}`)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeleteVariant(variantId: string, sku: string) {
    if (!window.confirm(`¿Eliminar variante ${sku}?`)) return;
    try {
      await apiDelete(`/admin/variants/${variantId}`);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar producto
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.name} ·{' '}
          <span className="font-mono">{data.slug}</span>
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4">Información general</h2>
        <ProductForm initial={data} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Variantes</h2>
            <p className="text-sm text-muted-foreground">
              Cada variante tiene su propio SKU, precio y stock.
            </p>
          </div>
          <Link
            href={`/products/${id}/variants/new`}
            className={cn(buttonVariants())}
          >
            <Plus className="size-4" />
            Nueva variante
          </Link>
        </div>

        {data.variants.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Este producto no tiene variantes todavía. Creá al menos una para que sea comprable.
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Atributos</TableHead>
                  <TableHead>Precio (bruto)</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                  <TableHead className="w-32 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono">{v.sku}</TableCell>
                    <TableCell>{v.name ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.attributes.map((a) => (
                          <Badge
                            key={a.attributeValue.id}
                            variant="secondary"
                          >
                            {a.attributeValue.attribute.name}:{' '}
                            {a.attributeValue.value}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatCLP(v.priceGross)}</TableCell>
                    <TableCell>{v.stock}</TableCell>
                    <TableCell>
                      <Badge variant={v.active ? 'success' : 'secondary'}>
                        {v.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Link
                        href={`/products/${id}/variants/${v.id}`}
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'icon' }),
                        )}
                        aria-label="Editar"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteVariant(v.id, v.sku)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Imágenes</h2>
          <p className="text-sm text-muted-foreground">
            Subí fotos del producto (JPEG/PNG/WebP/GIF/AVIF, máx 10MB).
          </p>
        </div>
        <MediaManager productId={data.id} initialMedia={data.media} />
      </section>
    </div>
  );
}
