import { parse } from 'csv-parse/sync';

import { cleanDescription } from './html-cleanup';

export type ProductRowType = 'simple' | 'variable' | 'variation' | 'unknown';

// Canonical target fields the CSV columns can map to.
// Keys are machine names; labels are shown in the UI dropdown.
export const TARGET_FIELDS = [
  { key: 'id', label: 'ID (solo referencia)' },
  { key: 'type', label: 'Tipo (simple/variable/variation)' },
  { key: 'sku', label: 'SKU (requerido)' },
  { key: 'name', label: 'Nombre (requerido)' },
  { key: 'published', label: 'Publicado' },
  { key: 'featured', label: 'Destacado' },
  { key: 'shortDesc', label: 'Descripción corta' },
  { key: 'description', label: 'Descripción' },
  { key: 'normalPrice', label: 'Precio normal' },
  { key: 'salePrice', label: 'Precio rebajado' },
  { key: 'stock', label: 'Inventario' },
  { key: 'weightKg', label: 'Peso (kg)' },
  { key: 'lengthCm', label: 'Longitud (cm)' },
  { key: 'widthCm', label: 'Anchura (cm)' },
  { key: 'heightCm', label: 'Altura (cm)' },
  { key: 'categories', label: 'Categorías' },
  { key: 'images', label: 'Imágenes' },
  { key: 'parent', label: 'Producto padre (variaciones)' },
] as const;

export type TargetFieldKey = (typeof TARGET_FIELDS)[number]['key'];

// Mapping: original CSV header → target field key (or null to skip).
export type ColumnMappings = Record<string, TargetFieldKey | null>;

export interface ParsedRow {
  rowIndex: number;
  type: ProductRowType;
  sku: string;
  name: string;
  shortDesc: string | null;
  description: string | null;
  isActive: boolean;
  isFeatured: boolean;
  priceNormal: number | null;
  priceSale: number | null;
  stock: number | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  categoryPaths: string[][];
  imageUrls: string[];
  parentRef: string | null;
  attributes: Array<{ name: string; values: string[] }>;
}

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
}

// WooCommerce Spanish header → target field key (for auto-suggest).
const WC_ALIASES: Record<string, TargetFieldKey> = {
  id: 'id',
  tipo: 'type',
  sku: 'sku',
  nombre: 'name',
  publicado: 'published',
  '¿está destacado?': 'featured',
  '¿esta destacado?': 'featured',
  'descripción corta': 'shortDesc',
  'descripcion corta': 'shortDesc',
  descripción: 'description',
  descripcion: 'description',
  inventario: 'stock',
  'precio rebajado': 'salePrice',
  'precio normal': 'normalPrice',
  'categorías': 'categories',
  categorias: 'categories',
  imágenes: 'images',
  imagenes: 'images',
  'peso (kg)': 'weightKg',
  'longitud (cm)': 'lengthCm',
  'anchura (cm)': 'widthCm',
  'altura (cm)': 'heightCm',
  superior: 'parent',
};

// Attribute columns follow the pattern "Nombre del atributo N" / "Valor(es) del atributo N".
const ATTR_NAME_RE = /^(?:nombre del atributo|name of attribute)\s*(\d+)$/i;
const ATTR_VALUE_RE = /^(?:valor\(es\) del atributo|value\(s\) of attribute)\s*(\d+)$/i;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseBool(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes' || t === 'sí' || t === 'si';
}

function parseIntOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parseFloatOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseType(v: string | undefined): ProductRowType {
  const t = (v ?? '').trim().toLowerCase();
  if (t === 'simple') return 'simple';
  if (t === 'variable') return 'variable';
  if (t === 'variation' || t === 'variación' || t === 'variacion') return 'variation';
  return 'unknown';
}

function parseCategories(v: string | undefined): string[][] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((path) => path.split('>').map((p) => p.trim()).filter(Boolean));
}

function parseImages(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^https?:\/\//i.test(s));
}

function parseAttrValues(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Parse raw CSV into records. Returns empty arrays for an empty file.
export function parseCsvHeaders(buffer: Buffer): {
  headers: string[];
  firstRow: Record<string, string> | null;
} {
  const records = parse(buffer, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];

  if (records.length === 0) return { headers: [], firstRow: null };

  return {
    headers: Object.keys(records[0]),
    firstRow: records[0],
  };
}

// Suggest column mappings based on WooCommerce-style headers.
// Headers that don't match a known WC alias are left as null (= "No importar").
export function suggestMappings(headers: string[]): ColumnMappings {
  const mappings: ColumnMappings = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    mappings[h] = WC_ALIASES[norm] ?? null;
  }
  return mappings;
}

// Detects WooCommerce attribute columns ("Nombre del atributo N" / "Valor(es) del atributo N")
// in the original headers. These are handled separately from user mappings because they
// come in variable-count pairs.
function detectAttributeColumns(
  headers: string[],
): Record<number, { nameHeader?: string; valueHeader?: string }> {
  const attrCols: Record<number, { nameHeader?: string; valueHeader?: string }> = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    const nameMatch = ATTR_NAME_RE.exec(norm);
    if (nameMatch) {
      const idx = Number(nameMatch[1]);
      attrCols[idx] = attrCols[idx] ?? {};
      attrCols[idx].nameHeader = h;
      continue;
    }
    const valueMatch = ATTR_VALUE_RE.exec(norm);
    if (valueMatch) {
      const idx = Number(valueMatch[1]);
      attrCols[idx] = attrCols[idx] ?? {};
      attrCols[idx].valueHeader = h;
    }
  }
  return attrCols;
}

// Main parser. `mappings` tells us which CSV column feeds which target field.
// If not provided, auto-suggests from WC aliases (keeps backward compat).
export function parseCsv(buffer: Buffer, mappings?: ColumnMappings): ParseResult {
  const records = parse(buffer, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];

  if (records.length === 0) return { rows: [], headers: [] };

  const originalHeaders = Object.keys(records[0]);
  const effective = mappings ?? suggestMappings(originalHeaders);
  const attrCols = detectAttributeColumns(originalHeaders);

  // Reverse: target field → original header. If user mapped two columns to the
  // same target, last one wins (UI should prevent this but be defensive).
  const fieldToHeader: Partial<Record<TargetFieldKey, string>> = {};
  for (const [header, field] of Object.entries(effective)) {
    if (field) fieldToHeader[field] = header;
  }

  const get = (rec: Record<string, string>, key: TargetFieldKey): string | undefined => {
    const h = fieldToHeader[key];
    return h ? rec[h] : undefined;
  };

  const rows: ParsedRow[] = records.map((rec, i) => {
    const attributes: Array<{ name: string; values: string[] }> = [];
    for (const idxStr of Object.keys(attrCols)) {
      const cols = attrCols[Number(idxStr)];
      const name = cols.nameHeader ? (rec[cols.nameHeader] ?? '').trim() : '';
      const valsRaw = cols.valueHeader ? rec[cols.valueHeader] : undefined;
      const values = parseAttrValues(valsRaw);
      if (name && values.length > 0) {
        attributes.push({ name, values });
      }
    }

    const weightKg = parseFloatOrNull(get(rec, 'weightKg'));
    const weightGrams = weightKg !== null ? Math.round(weightKg * 1000) : null;

    return {
      rowIndex: i + 2,
      type: parseType(get(rec, 'type')),
      sku: (get(rec, 'sku') ?? '').trim(),
      name: (get(rec, 'name') ?? '').trim(),
      shortDesc: cleanDescription(get(rec, 'shortDesc')),
      description: cleanDescription(get(rec, 'description')),
      isActive: parseBool(get(rec, 'published')),
      isFeatured: parseBool(get(rec, 'featured')),
      priceNormal: parseIntOrNull(get(rec, 'normalPrice')),
      priceSale: parseIntOrNull(get(rec, 'salePrice')),
      stock: parseIntOrNull(get(rec, 'stock')),
      weightGrams,
      lengthCm: parseIntOrNull(get(rec, 'lengthCm')),
      widthCm: parseIntOrNull(get(rec, 'widthCm')),
      heightCm: parseIntOrNull(get(rec, 'heightCm')),
      categoryPaths: parseCategories(get(rec, 'categories')),
      imageUrls: parseImages(get(rec, 'images')),
      parentRef: (get(rec, 'parent') ?? '').trim() || null,
      attributes,
    };
  });

  return { rows, headers: originalHeaders };
}

/** @deprecated Use parseCsv instead. */
export const parseWooCommerceCsv = parseCsv;
