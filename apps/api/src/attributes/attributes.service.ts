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
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
} from './dto/attributes.dto';

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.attribute.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: { values: { orderBy: { value: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.attribute.count(),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBySlug(slug: string) {
    const attr = await this.prisma.attribute.findUnique({
      where: { slug },
      include: { values: { orderBy: { value: 'asc' } } },
    });
    if (!attr) {
      throw new NotFoundException('Atributo no encontrado');
    }
    return attr;
  }

  async getById(id: string) {
    const attr = await this.prisma.attribute.findUnique({
      where: { id },
      include: { values: { orderBy: { value: 'asc' } } },
    });
    if (!attr) {
      throw new NotFoundException('Atributo no encontrado');
    }
    return attr;
  }

  async create(dto: CreateAttributeDto) {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Slug inválido');
    }
    const exists = await this.prisma.attribute.findFirst({
      where: { OR: [{ slug }, { name: dto.name }] },
    });
    if (exists) {
      throw new ConflictException('Ya existe un atributo con ese nombre o slug');
    }
    return this.prisma.attribute.create({ data: { name: dto.name, slug } });
  }

  async update(id: string, dto: UpdateAttributeDto) {
    const current = await this.getById(id);
    let slug = current.slug;
    if (dto.slug !== undefined) {
      slug = dto.slug.trim() || slugify(dto.name ?? current.name);
      if (slug !== current.slug) {
        const exists = await this.prisma.attribute.findUnique({
          where: { slug },
        });
        if (exists) {
          throw new ConflictException('Slug ya en uso');
        }
      }
    }
    return this.prisma.attribute.update({
      where: { id },
      data: { name: dto.name, slug },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.attribute.delete({ where: { id } });
    return { ok: true };
  }

  async addValue(attributeId: string, dto: CreateAttributeValueDto) {
    const attr = await this.getById(attributeId);
    const slug = dto.slug?.trim() || slugify(dto.value);
    if (!slug) {
      throw new BadRequestException('Slug inválido');
    }
    const exists = await this.prisma.attributeValue.findUnique({
      where: { attributeId_slug: { attributeId: attr.id, slug } },
    });
    if (exists) {
      throw new ConflictException('Ya existe ese valor en este atributo');
    }
    return this.prisma.attributeValue.create({
      data: { attributeId: attr.id, value: dto.value, slug },
    });
  }

  async removeValue(attributeId: string, valueId: string) {
    const value = await this.prisma.attributeValue.findUnique({
      where: { id: valueId },
    });
    if (!value || value.attributeId !== attributeId) {
      throw new NotFoundException('Valor no encontrado');
    }
    await this.prisma.attributeValue.delete({ where: { id: valueId } });
    return { ok: true };
  }
}
