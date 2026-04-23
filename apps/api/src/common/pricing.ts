// Pricing helpers shared across cart / checkout / public queries.
//
// A variant is "on sale" when:
//   - salePriceGross is set (i.e. admin configured a sale price), AND
//   - the current time is between saleStartAt and saleEndAt (inclusive).
//     Either/both dates may be null; null = open-ended on that side.

export interface PricedVariant {
  priceNet: number;
  priceGross: number;
  salePriceNet?: number | null;
  salePriceGross?: number | null;
  saleStartAt?: Date | string | null;
  saleEndAt?: Date | string | null;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export function isOnSale(variant: PricedVariant, now: Date = new Date()): boolean {
  if (
    variant.salePriceGross === null ||
    variant.salePriceGross === undefined ||
    variant.salePriceGross <= 0
  ) {
    return false;
  }
  const start = toDate(variant.saleStartAt);
  const end = toDate(variant.saleEndAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

/** Effective price to charge (net). Returns salePriceNet if on sale, else priceNet. */
export function effectivePriceNet(variant: PricedVariant, now: Date = new Date()): number {
  if (isOnSale(variant, now) && variant.salePriceNet != null) {
    return variant.salePriceNet;
  }
  return variant.priceNet;
}

/** Effective price to charge (gross, IVA-inclusive). */
export function effectivePriceGross(
  variant: PricedVariant,
  now: Date = new Date(),
): number {
  if (isOnSale(variant, now) && variant.salePriceGross != null) {
    return variant.salePriceGross;
  }
  return variant.priceGross;
}
