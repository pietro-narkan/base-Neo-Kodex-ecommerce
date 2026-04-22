// ===== Defaults del negocio =====

export const CURRENCY = 'CLP' as const;
export const COUNTRY = 'CL' as const;
export const DEFAULT_TAX_RATE_BP = 1900; // 19.00% IVA Chile (basis points)

// ===== Claves de la tabla Setting (DB) =====

export const SETTING_KEYS = {
  STORE_NAME: 'store.name',
  STORE_CURRENCY: 'store.currency',
  STORE_COUNTRY: 'store.country',
  STORE_TAX_RATE_BP: 'store.tax_rate_bp',
  STORE_CONTACT_EMAIL: 'store.contact_email',
  STORE_DESCRIPTION: 'store.description',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// ===== Utilidades de precio (CLP como entero) =====

export function netToGross(
  priceNet: number,
  taxRateBp: number = DEFAULT_TAX_RATE_BP,
): number {
  return Math.round(priceNet * (1 + taxRateBp / 10000));
}

export function grossToNet(
  priceGross: number,
  taxRateBp: number = DEFAULT_TAX_RATE_BP,
): number {
  return Math.round(priceGross / (1 + taxRateBp / 10000));
}

export function taxAmount(
  priceNet: number,
  taxRateBp: number = DEFAULT_TAX_RATE_BP,
): number {
  return Math.round(priceNet * (taxRateBp / 10000));
}

// ===== Formato visual CLP =====

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
}
