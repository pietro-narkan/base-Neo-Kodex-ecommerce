import Image from 'next/image';
import Link from 'next/link';

import { formatCLP } from '@/lib/utils';

interface Variant {
  id: string;
  priceGross: number;
  compareAtPrice: number | null;
}

interface Media {
  id: string;
  url: string;
  alt: string | null;
}

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  shortDesc: string | null;
  media: Media[];
  variants: Variant[];
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const firstImage = product.media[0];
  const minPrice =
    product.variants.length > 0
      ? Math.min(...product.variants.map((v) => v.priceGross))
      : null;
  const firstVariant = product.variants[0];
  const compareAt = firstVariant?.compareAtPrice ?? null;

  return (
    <Link
      href={`/productos/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/30"
    >
      <div className="aspect-square relative bg-muted/30">
        {firstImage ? (
          <Image
            src={firstImage.url}
            alt={firstImage.alt ?? product.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Sin imagen
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1">
        <h3 className="font-medium line-clamp-2">{product.name}</h3>
        {product.shortDesc && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {product.shortDesc}
          </p>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          {minPrice !== null ? (
            <>
              <span className="font-semibold">{formatCLP(minPrice)}</span>
              {compareAt && compareAt > minPrice && (
                <span className="text-xs line-through text-muted-foreground">
                  {formatCLP(compareAt)}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              No disponible
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
