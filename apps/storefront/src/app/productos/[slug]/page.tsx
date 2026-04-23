import type { Metadata } from 'next';

import { absoluteUrl, getApiUrl, getSiteName } from '@/lib/seo';

import { ProductView } from './product-view';

interface ProductForSeo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDesc: string | null;
  category: { name: string; slug: string } | null;
  variants: Array<{
    sku: string;
    priceGross: number;
    compareAtPrice: number | null;
    stock: number;
    salePriceGross: number | null;
    saleStartAt: string | null;
    saleEndAt: string | null;
  }>;
  media: Array<{ url: string; alt: string | null }>;
}

async function fetchProduct(slug: string): Promise<ProductForSeo | null> {
  const res = await fetch(`${getApiUrl()}/products/${slug}`, {
    next: { revalidate: 300 }, // 5 min: SEO-critical, but cache'll update eventually
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as ProductForSeo;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  const site = getSiteName();
  if (!product) {
    return {
      title: 'Producto no encontrado',
      robots: { index: false, follow: false },
    };
  }

  const description =
    product.shortDesc ??
    product.description?.slice(0, 180) ??
    `${product.name} disponible en ${site}.`;
  const firstImage = product.media[0]?.url;
  const canonical = absoluteUrl(`/productos/${product.slug}`);

  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: product.name,
      description,
      url: canonical,
      siteName: site,
      images: firstImage
        ? [{ url: firstImage, alt: product.media[0].alt ?? product.name }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: firstImage ? [firstImage] : undefined,
    },
  };
}

// Renders JSON-LD Product + Offer schema. Google uses this to show price +
// availability + breadcrumbs in search results.
function ProductJsonLd({ product }: { product: ProductForSeo }) {
  const variants = product.variants;
  const now = new Date();
  const effectivePrice = (v: ProductForSeo['variants'][number]): number => {
    if (
      v.salePriceGross !== null &&
      (!v.saleStartAt || new Date(v.saleStartAt) <= now) &&
      (!v.saleEndAt || new Date(v.saleEndAt) >= now)
    ) {
      return v.salePriceGross;
    }
    return v.priceGross;
  };

  const prices = variants.map(effectivePrice).filter((p) => p > 0);
  const lowPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const highPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const anyInStock = variants.some((v) => v.stock > 0);

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDesc ?? product.description ?? product.name,
    image: product.media.map((m) => m.url),
    sku: variants[0]?.sku,
    url: absoluteUrl(`/productos/${product.slug}`),
    ...(product.category
      ? { category: product.category.name }
      : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'CLP',
      lowPrice,
      highPrice,
      offerCount: variants.length,
      availability: anyInStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/productos/${product.slug}`),
    },
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

function BreadcrumbJsonLd({ product }: { product: ProductForSeo }) {
  const items = [
    { name: 'Inicio', item: absoluteUrl('/') },
    { name: 'Productos', item: absoluteUrl('/productos') },
    ...(product.category
      ? [
          {
            name: product.category.name,
            item: absoluteUrl(`/categoria/${product.category.slug}`),
          },
        ]
      : []),
    {
      name: product.name,
      item: absoluteUrl(`/productos/${product.slug}`),
    },
  ];
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((x, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: x.name,
      item: x.item,
    })),
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  return (
    <>
      {product && (
        <>
          <ProductJsonLd product={product} />
          <BreadcrumbJsonLd product={product} />
        </>
      )}
      <ProductView slug={slug} />
    </>
  );
}
