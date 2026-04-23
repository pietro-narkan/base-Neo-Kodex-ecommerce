import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type Severity = 'critical' | 'warning' | 'good';

export interface SeoIssue {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  /** Total de items afectados. 0 = check pasó sin problemas */
  affectedCount: number;
  /** Primeros N items afectados para navegar al problema */
  samples: Array<{
    id: string;
    name: string;
    /** Path relativo en el admin para ir al item a corregir */
    editPath: string;
  }>;
}

export interface SeoAuditResult {
  summary: {
    critical: number;
    warning: number;
    good: number;
    /** Score 0-100; 100 = sin problemas */
    score: number;
    checkedAt: string;
  };
  issues: SeoIssue[];
}

const SAMPLE_LIMIT = 5;

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async audit(): Promise<SeoAuditResult> {
    const [
      totalActiveProducts,
      totalCategories,
      productsWithoutMetaTitle,
      productsWithoutMetaDesc,
      productsShortMetaDesc,
      productsWithoutImages,
      productsWithoutDescription,
      productsWithoutShortDesc,
      productsNoVariants,
      productsAllOutOfStock,
      productsSlugTooLong,
      mediaWithoutAlt,
      categoriesNoDescription,
      storeSettings,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.category.count({ where: { active: true } }),

      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        metaTitle: null,
      }),
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        metaDescription: null,
      }),
      // metaDescription between 1 and 49 chars (empty string or NULL excluded by not: null)
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        metaDescription: { not: null },
        // Prisma no soporta length() directo, así que traemos con filtro no-null
        // y después filtramos en memoria por la sample. El count es aproximado.
      }),
      // Productos sin media (no tienen fotos propias ni heredadas de variantes)
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        media: { none: {} },
        variants: { none: { media: { some: {} } } },
      }),
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        description: null,
      }),
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        shortDesc: null,
      }),
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        variants: { none: {} },
      }),
      this.findProducts({
        status: 'ACTIVE',
        deletedAt: null,
        variants: { some: {} },
        // Todas las variantes con stock 0: NO hay ninguna variante con stock > 0
        AND: [
          { variants: { none: { stock: { gt: 0 } } } },
        ],
      }),
      this.findProductsRaw('SELECT id, name FROM "Product" WHERE LENGTH(slug) > 100 AND "deletedAt" IS NULL LIMIT $1', [SAMPLE_LIMIT]),

      this.prisma.media.count({
        where: { OR: [{ alt: null }, { alt: '' }] },
      }),
      this.prisma.category.count({
        where: { active: true, OR: [{ description: null }, { description: '' }] },
      }),
      this.prisma.setting.findMany({
        where: { key: { in: ['store.name', 'store.contact_email', 'store.description'] } },
      }),
    ]);

    // Meta description corta: re-count sobre sample (approximation).
    // Para count exacto, iteramos productos con meta set y contamos.
    const productsWithMetaDescSet = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        metaDescription: { not: null },
      },
      select: { id: true, name: true, metaDescription: true },
    });
    const shortMetaIds = productsWithMetaDescSet
      .filter((p) => (p.metaDescription?.length ?? 0) < 50)
      .map((p) => ({ id: p.id, name: p.name }));

    // Settings lookup
    const settingsMap = new Map(storeSettings.map((s) => [s.key, s.value]));
    const storeNameSet = typeof settingsMap.get('store.name') === 'string' && String(settingsMap.get('store.name')).trim() !== '';
    const contactEmailSet = typeof settingsMap.get('store.contact_email') === 'string' && String(settingsMap.get('store.contact_email')).includes('@');
    const storeDescSet = typeof settingsMap.get('store.description') === 'string' && String(settingsMap.get('store.description')).trim() !== '';

    const issues: SeoIssue[] = [];

    // ========== CRITICAL ==========
    issues.push({
      id: 'products-without-images',
      severity: 'critical',
      title: 'Productos sin ninguna imagen',
      description:
        'Productos activos que no tienen foto. Google no los posiciona bien, y el cliente no ve nada. Cada producto debería tener al menos 1 imagen.',
      affectedCount: productsWithoutImages.count,
      samples: productsWithoutImages.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'products-no-variants',
      severity: 'critical',
      title: 'Productos activos sin variantes',
      description:
        'Un producto activo sin variantes no se puede comprar. El storefront lo muestra como "sin stock" por default. Crea al menos una variante o archivalo.',
      affectedCount: productsNoVariants.count,
      samples: productsNoVariants.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'products-all-oos',
      severity: 'critical',
      title: 'Productos activos con todas las variantes en stock 0',
      description:
        'Aparecen en el catálogo como "Sin stock". Valorá archivarlos o reabastecer.',
      affectedCount: productsAllOutOfStock.count,
      samples: productsAllOutOfStock.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    // ========== WARNING ==========
    issues.push({
      id: 'products-without-meta-description',
      severity: 'warning',
      title: 'Productos sin meta description',
      description:
        'La meta description es el texto que aparece debajo del título en los resultados de Google. Sin ella, Google improvisa (a veces mal). Idealmente 120-160 caracteres describiendo el producto.',
      affectedCount: productsWithoutMetaDesc.count,
      samples: productsWithoutMetaDesc.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'products-short-meta-description',
      severity: 'warning',
      title: 'Meta description demasiado corta (< 50 caracteres)',
      description:
        'Meta descriptions muy cortas son percibidas como baja calidad. Expandí a 120-160 caracteres.',
      affectedCount: shortMetaIds.length,
      samples: shortMetaIds.slice(0, SAMPLE_LIMIT).map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'products-without-meta-title',
      severity: 'warning',
      title: 'Productos sin meta title',
      description:
        'Google usa el nombre del producto como fallback, pero un meta title propio te deja optimizar para keywords específicas (ej: incluir marca, ubicación).',
      affectedCount: productsWithoutMetaTitle.count,
      samples: productsWithoutMetaTitle.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'products-without-description',
      severity: 'warning',
      title: 'Productos sin descripción completa',
      description:
        'La descripción aparece en la página del producto. Sin ella, el cliente no sabe qué está comprando y Google tiene menos contexto para rankearlo.',
      affectedCount: productsWithoutDescription.count,
      samples: productsWithoutDescription.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'products-without-short-desc',
      severity: 'warning',
      title: 'Productos sin descripción corta',
      description:
        'La descripción corta aparece en el listado de productos y como fallback si no hay meta description.',
      affectedCount: productsWithoutShortDesc.count,
      samples: productsWithoutShortDesc.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'media-without-alt',
      severity: 'warning',
      title: 'Imágenes sin texto alternativo (alt)',
      description:
        'El alt text es crítico para accesibilidad (lectores de pantalla) y Google Images. Cada imagen debería describir brevemente lo que muestra.',
      affectedCount: mediaWithoutAlt,
      samples: [], // No hacemos drill-down al media individual aún
    });

    issues.push({
      id: 'slugs-too-long',
      severity: 'warning',
      title: 'Slugs de productos muy largos (> 100 caracteres)',
      description:
        'URLs largas se truncan en los resultados de Google y se ven mal al compartir. Idealmente < 60 caracteres.',
      affectedCount: productsSlugTooLong.count,
      samples: productsSlugTooLong.samples.map((p) => ({
        id: p.id,
        name: p.name,
        editPath: `/products/${p.id}`,
      })),
    });

    issues.push({
      id: 'categories-without-description',
      severity: 'warning',
      title: 'Categorías sin descripción',
      description:
        'Descripción en categorías ayuda al cliente a entender qué hay y a Google a rankear la landing de categoría.',
      affectedCount: categoriesNoDescription,
      samples: [],
    });

    // ========== CONFIG STORE-LEVEL ==========
    if (!storeNameSet) {
      issues.push({
        id: 'config-store-name',
        severity: 'critical',
        title: 'Nombre de la tienda no configurado',
        description:
          'El nombre aparece en el <title> de toda la tienda y en el Open Graph. Configuralo en Configuración → Tienda.',
        affectedCount: 1,
        samples: [{ id: 'settings', name: 'store.name', editPath: '/settings' }],
      });
    }
    if (!contactEmailSet) {
      issues.push({
        id: 'config-contact-email',
        severity: 'warning',
        title: 'Email de contacto no configurado',
        description:
          'Este email recibe notificaciones de nuevas órdenes y aparece en el footer como contacto.',
        affectedCount: 1,
        samples: [{ id: 'settings', name: 'store.contact_email', editPath: '/settings' }],
      });
    }
    if (!storeDescSet) {
      issues.push({
        id: 'config-store-description',
        severity: 'warning',
        title: 'Descripción de la tienda no configurada',
        description:
          'Aparece como meta description de la home y en las OG tags cuando compartís el link.',
        affectedCount: 1,
        samples: [{ id: 'settings', name: 'store.description', editPath: '/settings' }],
      });
    }

    // ========== GOOD (informational, always show) ==========
    if (totalActiveProducts > 0) {
      issues.push({
        id: 'total-products',
        severity: 'good',
        title: `${totalActiveProducts} productos activos en el catálogo`,
        description: 'Estos se incluyen en el sitemap.xml y son indexables por Google.',
        affectedCount: 0,
        samples: [],
      });
    }
    if (totalCategories > 0) {
      issues.push({
        id: 'total-categories',
        severity: 'good',
        title: `${totalCategories} categorías activas`,
        description: 'Todas aparecen en el sitemap.xml.',
        affectedCount: 0,
        samples: [],
      });
    }

    // ========== SCORE ==========
    const criticalCount = issues.filter((i) => i.severity === 'critical' && i.affectedCount > 0).length;
    const warningCount = issues.filter((i) => i.severity === 'warning' && i.affectedCount > 0).length;
    const goodCount = issues.filter((i) => i.severity === 'good').length;

    // Score: 100 base, -15 por cada critical con afectados, -5 por cada warning con afectados.
    const score = Math.max(0, 100 - criticalCount * 15 - warningCount * 5);

    return {
      summary: {
        critical: criticalCount,
        warning: warningCount,
        good: goodCount,
        score,
        checkedAt: new Date().toISOString(),
      },
      issues: issues
        // Filtrar los que pasaron (good sample-less)
        .filter((i) => i.severity === 'good' || i.affectedCount > 0)
        // Ordenar critical primero, warning, good al final
        .sort((a, b) => {
          const order = { critical: 0, warning: 1, good: 2 };
          return order[a.severity] - order[b.severity];
        }),
    };
  }

  /**
   * Helper: ejecuta count + findMany(take=5) en paralelo para tener total + sample.
   */
  private async findProducts(
    where: Prisma.ProductWhereInput,
  ): Promise<{
    count: number;
    samples: Array<{ id: string; name: string }>;
  }> {
    const [count, samples] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        take: SAMPLE_LIMIT,
        select: { id: true, name: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return { count, samples };
  }

  private async findProductsRaw(
    query: string,
    params: unknown[],
  ): Promise<{ count: number; samples: Array<{ id: string; name: string }> }> {
    const samples = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; name: string }>
    >(query, ...params);
    // Para el count exacto harían falta dos queries; aproximamos con samples.length.
    // Raw se usa solo acá donde Prisma no soporta LENGTH().
    return { count: samples.length, samples };
  }
}
