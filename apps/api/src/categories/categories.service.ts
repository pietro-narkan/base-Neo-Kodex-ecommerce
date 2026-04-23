import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { PaginationDto } from '../common/dto/pagination.dto';
import { slugify } from '../common/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = { active: true };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.category.count({ where }),
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
    const category = await this.prisma.category.findUnique({
      where: { slug },
    });
    if (!category || !category.active) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  async listAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.category.count(),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Slug inválido');
    }

    const exists = await this.prisma.category.findUnique({ where: { slug } });
    if (exists) {
      throw new ConflictException('Ya existe una categoría con ese slug');
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new BadRequestException('parentId inválido');
      }
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId,
        order: dto.order ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.getById(id);

    let slug = current.slug;
    if (dto.slug !== undefined) {
      slug = dto.slug.trim() || slugify(dto.name ?? current.name);
      if (slug !== current.slug) {
        const exists = await this.prisma.category.findUnique({
          where: { slug },
        });
        if (exists) {
          throw new ConflictException('Slug ya en uso');
        }
      }
    }

    if (
      dto.parentId !== undefined &&
      dto.parentId !== null &&
      dto.parentId !== current.parentId
    ) {
      if (dto.parentId === id) {
        throw new BadRequestException(
          'parentId no puede ser la misma categoría',
        );
      }
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new BadRequestException('parentId inválido');
      }
      // Cycle detection: walk up from the proposed parent. If `id` appears
      // in the ancestor chain, setting parentId to dto.parentId would close
      // a cycle (e.g. A→B→C, trying to set A.parent=C).
      await this.assertNoCycle(id, dto.parentId);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId,
        order: dto.order,
        active: dto.active,
      },
    });
  }

  /**
   * Walks up the parent chain starting from `proposedParentId`. Throws if
   * `selfId` is encountered, which would mean the update closes a cycle.
   * Safety cap at 100 hops to prevent infinite loops from pre-existing bad data.
   */
  private async assertNoCycle(
    selfId: string,
    proposedParentId: string,
  ): Promise<void> {
    let cursor: string | null = proposedParentId;
    let hops = 0;
    while (cursor && hops < 100) {
      if (cursor === selfId) {
        throw new BadRequestException(
          'Ciclo detectado: la categoría propuesta como padre es descendiente de esta',
        );
      }
      const next: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = next?.parentId ?? null;
      hops += 1;
    }
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
