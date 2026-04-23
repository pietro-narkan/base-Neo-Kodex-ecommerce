export interface ProductImportOptions {
  priceIncludesTax: boolean;
  taxRateBp?: number;
}

export interface ImportRowError {
  row: number;
  sku?: string;
  message: string;
}
