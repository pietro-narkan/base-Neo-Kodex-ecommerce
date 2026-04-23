import { parse } from 'csv-parse/sync';

export type ProductRowType = 'simple' | 'variable' | 'variation' | 'unknown';

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

// Map of WooCommerce Spanish headers → canonical keys.
// Headers are normalized (lowercased, trimmed, spaces collapsed) before lookup.
const HEADER_ALIASES: Record<string, string> = {
  id: 'id',
  tipo: 'type',
  sku: 'sku',
  nombre: 'name',
  publicado: 'published',
  '¿está destacado?': 'featured',
  '¿esta destacado?': 'featured',
  'visibilidad en el catálogo': 'visibility',
  'visibilidad en el catalogo': 'visibility',
  'descripción corta': 'shortDesc',
  'descripcion corta': 'shortDesc',
  descripción: 'description',
  descripcion: 'description',
  '¿existencias?': 'inStock',
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

// Split WC categories field: "Estar > Baúl, Estar" → [["Estar","Baúl"], ["Estar"]]
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
  // WC separates multi-values with " | " (pipe with spaces)
  return v
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseWooCommerceCsv(buffer: Buffer): ParseResult {
  const records = parse(buffer, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as Record<string, string>[];

  if (records.length === 0) {
    return { rows: [], headers: [] };
  }

  const originalHeaders = Object.keys(records[0]);

  // Build lookup: canonicalKey → original header name
  const headerMap: Record<string, string> = {};
  // Attribute columns: idx → { nameHeader?, valueHeader? }
  const attrCols: Record<number, { nameHeader?: string; valueHeader?: string }> = {};

  for (const h of originalHeaders) {
    const norm = normalizeHeader(h);
    if (HEADER_ALIASES[norm]) {
      headerMap[HEADER_ALIASES[norm]] = h;
      continue;
    }
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

  const get = (rec: Record<string, string>, key: string): string | undefined => {
    const h = headerMap[key];
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
      rowIndex: i + 2, // account for header row; 1-based for the user
      type: parseType(get(rec, 'type')),
      sku: (get(rec, 'sku') ?? '').trim(),
      name: (get(rec, 'name') ?? '').trim(),
      shortDesc: (get(rec, 'shortDesc') ?? '').trim() || null,
      description: (get(rec, 'description') ?? '').trim() || null,
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
