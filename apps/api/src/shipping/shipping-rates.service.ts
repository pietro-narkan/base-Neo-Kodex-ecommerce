import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** The 16 official regions of Chile (post-2018 reform with Ñuble). */
export const CHILE_REGIONS = [
  'Arica y Parinacota',
  'Tarapacá',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaíso',
  'Metropolitana',
  "O'Higgins",
  'Maule',
  'Ñuble',
  'Biobío',
  'Araucanía',
  'Los Ríos',
  'Los Lagos',
  'Aysén',
  'Magallanes',
] as const;

export type ChileRegion = (typeof CHILE_REGIONS)[number];

interface UpsertInput {
  region: string;
  rate: number;
  freeThreshold?: number | null;
  etaDays?: number | null;
  active?: boolean;
}

@Injectable()
export class ShippingRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const existing = await this.prisma.shippingRate.findMany({
      orderBy: { region: 'asc' },
    });
    // Surface the full 16-region list to the UI even if some aren't configured yet,
    // so the admin doesn't have to remember them.
    const configured = new Map(existing.map((r) => [r.region, r]));
    const all = CHILE_REGIONS.map(
      (region) =>
        configured.get(region) ?? {
          id: null,
          region,
          rate: null,
          freeThreshold: null,
          etaDays: null,
          active: false,
          createdAt: null,
          updatedAt: null,
        },
    );
    // Include any non-standard regions that might've been saved manually.
    const extraRegions = existing.filter(
      (r) => !CHILE_REGIONS.includes(r.region as ChileRegion),
    );
    return [...all, ...extraRegions];
  }

  async upsert(dto: UpsertInput, actor: { id: string; email: string }) {
    if (!dto.region || dto.region.trim().length === 0) {
      throw new BadRequestException('Region es obligatorio');
    }
    if (!Number.isInteger(dto.rate) || dto.rate < 0) {
      throw new BadRequestException('Rate debe ser entero >= 0 (CLP)');
    }
    if (
      dto.freeThreshold !== null &&
      dto.freeThreshold !== undefined &&
      (!Number.isInteger(dto.freeThreshold) || dto.freeThreshold < 0)
    ) {
      throw new BadRequestException('freeThreshold debe ser entero >= 0 o null');
    }
    const before = await this.prisma.shippingRate.findUnique({
      where: { region: dto.region },
    });
    const row = await this.prisma.shippingRate.upsert({
      where: { region: dto.region },
      update: {
        rate: dto.rate,
        freeThreshold: dto.freeThreshold ?? null,
        etaDays: dto.etaDays ?? null,
        active: dto.active ?? true,
      },
      create: {
        region: dto.region,
        rate: dto.rate,
        freeThreshold: dto.freeThreshold ?? null,
        etaDays: dto.etaDays ?? null,
        active: dto.active ?? true,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: before ? 'update' : 'create',
      entityType: 'shippingRate',
      entityId: row.id,
      before: before
        ? {
            rate: before.rate,
            freeThreshold: before.freeThreshold,
            etaDays: before.etaDays,
            active: before.active,
          }
        : undefined,
      after: {
        rate: row.rate,
        freeThreshold: row.freeThreshold,
        etaDays: row.etaDays,
        active: row.active,
      },
    });
    return row;
  }

  async remove(region: string, actor: { id: string; email: string }) {
    const existing = await this.prisma.shippingRate.findUnique({
      where: { region },
    });
    if (!existing) throw new NotFoundException('Región no configurada');
    await this.prisma.shippingRate.delete({ where: { region } });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      entityType: 'shippingRate',
      entityId: existing.id,
      before: {
        rate: existing.rate,
        freeThreshold: existing.freeThreshold,
        etaDays: existing.etaDays,
        active: existing.active,
      },
    });
    return { ok: true };
  }
}
