import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { PaginationDto } from '../common/dto/pagination.dto';
import { slugify } from '../common/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateProductDto,
  UpdateProductDto,
} from './dto/products.dto';

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

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(
    pagination: PaginationDto,
    filters: { categoryId?: string; featured?: boolean },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.ProductWhereInput = {
      active: true,
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
    if (!product || !product.active) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async listAdmin(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: adminInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count(),
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

  async create(dto: CreateProductDto) {
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

    return this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        shortDesc: dto.shortDesc,
        categoryId: dto.categoryId,
        active: dto.active ?? true,
        featured: dto.featured ?? false,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
      include: adminInclude,
    });
  }

  async update(id: string, dto: UpdateProductDto) {
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

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        shortDesc: dto.shortDesc,
        categoryId: dto.categoryId,
        active: dto.active,
        featured: dto.featured,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
      include: adminInclude,
    });
  }

  async remove(id: string) {
    await this.getByIdAdmin(id);
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }
}
