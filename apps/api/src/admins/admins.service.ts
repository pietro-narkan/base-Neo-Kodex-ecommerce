import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChangeOwnPasswordDto,
  CreateAdminDto,
  UpdateAdminDto,
} from './dto/admins.dto';

// Fields safe to return in API responses (never include passwordHash).
const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.admin.findMany({
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      select: publicSelect,
    });
    if (!admin) throw new NotFoundException('Admin no encontrado');
    return admin;
  }

  async create(dto: CreateAdminDto, actor: { id: string; email: string }) {
    const existing = await this.prisma.admin.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email ya en uso');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.admin.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role ?? 'VIEWER',
        active: true,
      },
      select: publicSelect,
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      entityType: 'admin',
      entityId: created.id,
      after: { email: created.email, role: created.role, active: created.active },
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateAdminDto,
    actor: { id: string; email: string },
  ) {
    const before = await this.prisma.admin.findUnique({
      where: { id },
      select: publicSelect,
    });
    if (!before) throw new NotFoundException('Admin no encontrado');

    // Don't let an admin demote / disable the last active ADMIN.
    if ((dto.role && dto.role !== 'ADMIN') || dto.active === false) {
      if (before.role === 'ADMIN') {
        const adminCount = await this.prisma.admin.count({
          where: { role: 'ADMIN', active: true, id: { not: id } },
        });
        if (adminCount === 0) {
          throw new BadRequestException(
            'No se puede desactivar o degradar al único ADMIN activo',
          );
        }
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const updated = await this.prisma.admin.update({
      where: { id },
      data,
      select: publicSelect,
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      entityType: 'admin',
      entityId: id,
      before: {
        name: before.name,
        role: before.role,
        active: before.active,
      },
      after: {
        name: updated.name,
        role: updated.role,
        active: updated.active,
        passwordChanged: Boolean(dto.password),
      },
    });
    return updated;
  }

  async remove(id: string, actor: { id: string; email: string }) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Admin no encontrado');
    if (admin.id === actor.id) {
      throw new ForbiddenException('No podés borrarte a vos mismo');
    }
    if (admin.role === 'ADMIN') {
      const adminCount = await this.prisma.admin.count({
        where: { role: 'ADMIN', active: true, id: { not: id } },
      });
      if (adminCount === 0) {
        throw new BadRequestException(
          'No se puede borrar al único ADMIN activo',
        );
      }
    }
    await this.prisma.admin.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      entityType: 'admin',
      entityId: id,
      before: { email: admin.email, role: admin.role },
    });
    return { ok: true };
  }

  async changeOwnPassword(
    id: string,
    dto: ChangeOwnPasswordDto,
    actor: { id: string; email: string },
  ) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException();
    const ok = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Contraseña actual incorrecta');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.admin.update({
      where: { id },
      data: { passwordHash },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update.password',
      entityType: 'admin',
      entityId: id,
    });
    return { ok: true };
  }
}
