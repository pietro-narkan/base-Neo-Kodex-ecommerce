import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ProductStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import type { PaginationDto } from '../common/dto/pagination.dto';
import { slugify } from '../common/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateProductDto,
  UpdateProductDto,
} from './dto/products.dto';

// Public listings exclude drafts, archived and soft-deleted rows.
const publicWhere = {
  status: 'ACTIVE' as ProductStatus,
  deletedAt: null,
};

const publicInclude = {
  category: true,
  variants: {
    where: { active: true },
    include: {
      attributes: {
        include: {
          attributeValue: { include: { attribute: true } },
        },
      },
      media: { orderBy: { position: 'asc' as const } },
    },
    orderBy: { priceGross: 'asc' as const },
  },
  media: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.ProductInclude;

const adminInclude = {
  category: true,
  variants: {
    include: {
      attributes: {
        include: {
          attributeValue: { include: { attribute: true } },
        },
      },
      media: { orderBy: { position: 'asc' as const } },
    },
  },
  media: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.ProductInclude;

interface AdminListFilters {
  status?: ProductStatus;
  includeDeleted?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublic(
    pagination: PaginationDto,
    filters: { categoryId?: string; featured?: boolean },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.ProductWhereInput = {
      ...publicWhere,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.featured !== undefined ? { featured: filters.featured } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: publicInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBySlugPublic(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: publicInclude,
    });
    if (!product || product.status !== 'ACTIVE' || product.deletedAt !== null) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async listAdmin(pagination: PaginationDto, filters: AdminListFilters = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.ProductWhereInput = {
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: adminInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getByIdAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: adminInclude,
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async create(dto: CreateProductDto, actor?: { id: string; email: string }) {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Slug inválido');
    }
    const exists = await this.prisma.product.findUnique({ where: { slug } });
    if (exists) {
      throw new ConflictException('Slug ya en uso');
    }

    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!cat) {
        throw new BadRequestException('categoryId inválido');
      }
    }

    // Resolve the initial status. Accepting status directly if provided; otherwise
    // default to ACTIVE for backward compat. `active` kept in sync for public queries.
    const status: ProductStatus = dto.status ?? 'ACTIVE';

    const created = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        shortDesc: dto.shortDesc,
        categoryId: dto.categoryId,
        status,
        active: status === 'ACTIVE',
        featured: dto.featured ?? false,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
      include: adminInclude,
    });

    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'create',
        entityType: 'product',
        entityId: created.id,
        after: { name: created.name, slug: created.slug, status: created.status },
      });
    }
    return created;
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    actor?: { id: string; email: string },
  ) {
    const current = await this.getByIdAdmin(id);

    let slug = current.slug;
    if (dto.slug !== undefined) {
      slug = dto.slug.trim() || slugify(dto.name ?? current.name);
      if (slug !== current.slug) {
        const exists = await this.prisma.product.findUnique({
          where: { slug },
        });
        if (exists) {
          throw new ConflictException('Slug ya en uso');
        }
      }
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      const cat = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!cat) {
        throw new BadRequestException('categoryId inválido');
      }
    }

    const nextStatus = dto.status ?? current.status;
    // Use UncheckedUpdateInput so we can pass `categoryId` as a raw FK (simpler
    // than the nested `category: { connect: ... }` form for null/set flows).
    const data: Prisma.ProductUncheckedUpdateInput = {
      name: dto.name,
      slug,
      description: dto.description,
      shortDesc: dto.shortDesc,
      categoryId: dto.categoryId,
      status: dto.status,
      // Keep boolean active in sync when status changes.
      active: dto.status !== undefined ? nextStatus === 'ACTIVE' : dto.active,
      featured: dto.featured,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };

    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: adminInclude,
    });

    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'update',
        entityType: 'product',
        entityId: id,
        before: {
          name: current.name,
          status: current.status,
          active: current.active,
          featured: current.featured,
        },
        after: {
          name: updated.name,
          status: updated.status,
          active: updated.active,
          featured: updated.featured,
        },
      });
    }
    return updated;
  }

  /**
   * Soft delete: mark deletedAt instead of removing the row. Preserves
   * order item references (OrderItem.variantId relies on Variant/Product existing).
   * Use `purge` for a hard delete.
   */
  async remove(id: string, actor?: { id: string; email: string }) {
    const product = await this.getByIdAdmin(id);
    if (product.deletedAt) {
      return { ok: true }; // already soft-deleted, idempotent
    }
    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        active: false,
      },
    });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'delete.soft',
        entityType: 'product',
        entityId: id,
        before: { name: product.name, status: product.status },
      });
    }
    return { ok: true };
  }

  async listTrash(params: { page?: number; limit?: number } = {}) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    const where: Prisma.ProductWhereInput = { deletedAt: { not: null } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { deletedAt: 'desc' },
        include: adminInclude,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Hard delete. Cascades to Variants → sets OrderItem.variantId = null via
   * onDelete: SetNull (snapshot stays intact). Use only on soft-deleted rows.
   */
  async purge(id: string, actor?: { id: string; email: string }) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: adminInclude,
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!product.deletedAt) {
      throw new BadRequestException(
        'Solo se pueden purgar productos soft-deleted. Primero enviar a papelera.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'delete.hard',
        entityType: 'product',
        entityId: id,
        before: { name: product.name, slug: product.slug },
      });
    }
    return { ok: true };
  }

  /**
   * Hard-delete all soft-deleted products. Used both by the manual "Vaciar papelera"
   * button and by the retention cron (from ProductsTrashService).
   */
  async purgeAllTrash(
    actor?: { id: string; email: string },
    olderThanDate?: Date,
  ): Promise<{ count: number }> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: olderThanDate
        ? { not: null, lte: olderThanDate }
        : { not: null },
    };
    const ids = await this.prisma.product.findMany({
      where,
      select: { id: true, name: true },
    });
    if (ids.length === 0) return { count: 0 };
    const result = await this.prisma.product.deleteMany({ where });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'delete.hard.bulk',
        entityType: 'product',
        metadata: {
          count: result.count,
          olderThan: olderThanDate?.toISOString(),
          ids: ids.map((p) => p.id),
        },
      });
    }
    return { count: result.count };
  }

  /** Bulk change status for many products at once. */
  async bulkUpdateStatus(
    ids: string[],
    status: ProductStatus,
    actor: { id: string; email: string },
  ): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };
    const result = await this.prisma.product.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status, active: status === 'ACTIVE' },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'bulk.status',
      entityType: 'product',
      metadata: { count: result.count, status, ids },
    });
    return { count: result.count };
  }

  /** Bulk soft-delete. Moves products to the trash. */
  async bulkSoftDelete(
    ids: string[],
    actor: { id: string; email: string },
  ): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };
    const result = await this.prisma.product.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        active: false,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'bulk.delete.soft',
      entityType: 'product',
      metadata: { count: result.count, ids },
    });
    return { count: result.count };
  }

  /** Bulk restore: undo soft-delete for multiple products. */
  async bulkRestore(
    ids: string[],
    actor: { id: string; email: string },
  ): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };
    const result = await this.prisma.product.updateMany({
      where: { id: { in: ids }, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'bulk.restore',
      entityType: 'product',
      metadata: { count: result.count, ids },
    });
    return { count: result.count };
  }

  /** Restore a soft-deleted product back to ARCHIVED (admin can re-activate after). */
  async restore(id: string, actor?: { id: string; email: string }) {
    const product = await this.getByIdAdmin(id);
    if (!product.deletedAt) {
      throw new BadRequestException('Producto no está eliminado');
    }
    const restored = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null },
    });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'restore',
        entityType: 'product',
        entityId: id,
      });
    }
    return restored;
  }
}
