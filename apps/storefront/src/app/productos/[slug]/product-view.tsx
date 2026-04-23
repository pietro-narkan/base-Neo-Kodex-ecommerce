'use client';

import { Loader2, Minus, Plus, ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, apiGet } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { cn, formatCLP } from '@/lib/utils';

import { ReviewsSection } from './reviews-section';

interface AttributeValue {
  id: string;
  value: string;
  slug: string;
  attribute: { id: string; name: string; slug: string };
}

interface Media {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

interface Variant {
  id: string;
  sku: string;
  name: string | null;
  priceNet: number;
  priceGross: number;
  compareAtPrice: number | null;
  stock: number;
  active: boolean;
  attributes: Array<{ attributeValue: AttributeValue }>;
  media: Media[];
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDesc: string | null;
  category: { id: string; name: string; slug: string } | null;
  variants: Variant[];
  media: Media[];
}

export function ProductView({ slug }: { slug: string }) {
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<
    { type: 'success' | 'error'; msg: string } | null
  >(null);
  const [mainImageIdx, setMainImageIdx] = useState(0);

  useEffect(() => {
    apiGet<Product>(`/products/${slug}`)
      .then((p) => {
        setProduct(p);
        if (p.variants.length > 0) setSelectedVariantId(p.variants[0].id);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError('Producto no encontrado');
        } else {
          setError((err as Error).message);
        }
      });
  }, [slug]);

  const variant = useMemo(
    () => product?.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product, selectedVariantId],
  );

  useEffect(() => {
    setMainImageIdx(0);
    setQty(1);
    setFeedback(null);
  }, [selectedVariantId]);

  const images = useMemo(() => {
    if (!product) return [] as Media[];
    const variantMedia = variant?.media ?? [];
    const seen = new Set(variantMedia.map((m) => m.id));
    const combined = [...variantMedia];
    for (const m of product.media) {
      if (!seen.has(m.id)) combined.push(m);
    }
    return combined;
  }, [product, variant]);

  const attributeGroups = useMemo(() => {
    if (!product)
      return [] as Array<{
        id: string;
        name: string;
        values: AttributeValue[];
      }>;
    const byAttr = new Map<
      string,
      { id: string; name: string; values: Map<string, AttributeValue> }
    >();
    for (const v of product.variants) {
      for (const va of v.attributes) {
        const attrId = va.attributeValue.attribute.id;
        if (!byAttr.has(attrId)) {
          byAttr.set(attrId, {
            id: attrId,
            name: va.attributeValue.attribute.name,
            values: new Map(),
          });
        }
        byAttr.get(attrId)!.values.set(va.attributeValue.id, va.attributeValue);
      }
    }
    return Array.from(byAttr.values()).map((g) => ({
      id: g.id,
      name: g.name,
      values: Array.from(g.values.values()),
    }));
  }, [product]);

  async function handleAddToCart() {
    if (!variant) return;
    setAdding(true);
    setFeedback(null);
    try {
      await addItem(variant.id, qty);
      setFeedback({ type: 'success', msg: '✓ Agregado al carrito' });
    } catch (err) {
      setFeedback({ type: 'error', msg: (err as Error).message });
    } finally {
      setAdding(false);
    }
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-24 flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const outOfStock = !variant || variant.stock === 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        <div className="space-y-3">
          <div className="aspect-square relative rounded-lg border overflow-hidden bg-muted/30">
            {images[mainImageIdx] ? (
              <Image
                src={images[mainImageIdx].url}
                alt={images[mainImageIdx].alt ?? product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                unoptimized
                priority
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Sin imagen
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {images.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMainImageIdx(i)}
                  className={cn(
                    'aspect-square relative rounded-md border overflow-hidden bg-muted/30 transition-all',
                    i === mainImageIdx
                      ? 'ring-2 ring-foreground ring-offset-2'
                      : 'opacity-70 hover:opacity-100',
                  )}
                >
                  <Image
                    src={m.url}
                    alt={m.alt ?? ''}
                    fill
                    sizes="100px"
                    className="object-cover"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            {product.category && (
              <Badge variant="secondary" className="mb-3">
                {product.category.name}
              </Badge>
            )}
            <h1 className="text-3xl font-semibold tracking-tight">
              {product.name}
            </h1>
            {product.shortDesc && (
              <p className="text-muted-foreground mt-2">{product.shortDesc}</p>
            )}
          </div>

          {variant && (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold">
                {formatCLP(variant.priceGross)}
              </span>
              {variant.compareAtPrice &&
                variant.compareAtPrice > variant.priceGross && (
                  <span className="text-lg line-through text-muted-foreground">
                    {formatCLP(variant.compareAtPrice)}
                  </span>
                )}
            </div>
          )}

          {attributeGroups.length > 0 && (
            <div className="space-y-4">
              {attributeGroups.map((g) => (
                <div key={g.id}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {g.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.values.map((v) => {
                      const matchingVariant = product.variants.find((va) =>
                        va.attributes.some(
                          (a) => a.attributeValue.id === v.id,
                        ),
                      );
                      const isSelected = variant?.attributes.some(
                        (a) => a.attributeValue.id === v.id,
                      );
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            if (matchingVariant)
                              setSelectedVariantId(matchingVariant.id);
                          }}
                          disabled={!matchingVariant}
                          className={cn(
                            'inline-flex items-center rounded-md border px-3 py-1.5 text-sm transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'hover:bg-accent',
                            !matchingVariant &&
                              'opacity-40 cursor-not-allowed',
                          )}
                        >
                          {v.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {variant && (
            <div className="text-sm text-muted-foreground">
              {variant.stock > 0 ? (
                <span>{variant.stock} disponibles</span>
              ) : (
                <span className="text-destructive">Sin stock</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                type="button"
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-10 text-center font-medium">{qty}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setQty((q) => Math.min(variant?.stock ?? 1, q + 1))
                }
                disabled={!variant || qty >= variant.stock}
                type="button"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <Button
              onClick={handleAddToCart}
              disabled={!variant || outOfStock || adding}
              className="flex-1"
              size="lg"
            >
              {adding ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShoppingCart className="size-4" />
              )}
              {outOfStock ? 'Sin stock' : 'Agregar al carrito'}
            </Button>
          </div>

          {feedback && (
            <div
              className={cn(
                'text-sm rounded-md px-3 py-2',
                feedback.type === 'success'
                  ? 'bg-green-500/10 text-green-700 border border-green-500/30'
                  : 'bg-destructive/10 text-destructive border border-destructive/30',
              )}
            >
              {feedback.msg}
            </div>
          )}

          {product.description && (
            <details className="border-t pt-6">
              <summary className="cursor-pointer font-medium text-sm">
                Descripción completa
              </summary>
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {product.description}
              </p>
            </details>
          )}
        </div>
      </div>

      <ReviewsSection productId={product.id} />
    </div>
  );
}
