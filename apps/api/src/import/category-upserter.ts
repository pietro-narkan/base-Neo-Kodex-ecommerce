import type { Category } from '@prisma/client';

import { slugify } from '../common/slugify';
import type { PrismaService } from '../prisma/prisma.service';

// Walks a chain of category names and ensures the whole tree exists.
// Returns the leaf Category. Uses slugs with numeric suffixes on collision.
export class CategoryUpserter {
  // Cache per instance to avoid repeated lookups within a single import run.
  private readonly cache = new Map<string, Category>();

  constructor(private readonly prisma: PrismaService) {}

  async ensurePath(path: string[]): Promise<Category | null> {
    if (path.length === 0) return null;

    let parent: Category | null = null;
    let cumulativeKey = '';

    for (const name of path) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      cumulativeKey = cumulativeKey
        ? `${cumulativeKey}/${trimmed.toLowerCase()}`
        : trimmed.toLowerCase();

      const cached = this.cache.get(cumulativeKey);
      if (cached) {
        parent = cached;
        continue;
      }

      const found: Category | null = await this.prisma.category.findFirst({
        where: {
          name: trimmed,
          parentId: parent?.id ?? null,
        },
      });
      if (found) {
        this.cache.set(cumulativeKey, found);
        parent = found;
        continue;
      }

      const slug = await this.findAvailableSlug(trimmed);
      const created: Category = await this.prisma.category.create({
        data: {
          name: trimmed,
          slug,
          parentId: parent?.id ?? null,
          active: true,
        },
      });
      this.cache.set(cumulativeKey, created);
      parent = created;
    }

    return parent;
  }

  // Pick the most specific path out of a list. Returns the leaf Category.
  async ensureMostSpecific(paths: string[][]): Promise<Category | null> {
    if (paths.length === 0) return null;
    // Longest path wins; on tie, take the first seen.
    const best = [...paths].sort((a, b) => b.length - a.length)[0];
    return this.ensurePath(best);
  }

  private async findAvailableSlug(name: string): Promise<string> {
    const base = slugify(name) || 'categoria';
    let slug = base;
    let i = 1;
    while (await this.prisma.category.findUnique({ where: { slug } })) {
      i += 1;
      slug = `${base}-${i}`;
    }
    return slug;
  }
}
