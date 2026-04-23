import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ANALYTICS_SETTING_PREFIX } from '../analytics/analytics.catalog';
import { AuditService } from '../audit/audit.service';
import { EMAIL_TEMPLATE_SETTING_PREFIX } from '../emails/email-templates.catalog';
import { PrismaService } from '../prisma/prisma.service';
import { REVIEWS_SETTING_PREFIX } from '../reviews/reviews.service';

// Schema of known settings, used by the admin UI to render appropriate
// inputs. Adding a key here is optional; unknown keys are editable as JSON.
export const KNOWN_SETTINGS = [
  { key: 'store.name', label: 'Nombre de la tienda', type: 'string', group: 'Tienda' },
  { key: 'store.description', label: 'Descripción', type: 'text', group: 'Tienda' },
  { key: 'store.contact_email', label: 'Email de contacto', type: 'email', group: 'Tienda' },
  { key: 'store.currency', label: 'Moneda (ISO 4217)', type: 'string', group: 'Tienda' },
  { key: 'store.country', label: 'País (ISO 3166)', type: 'string', group: 'Tienda' },
  { key: 'store.tax_rate_bp', label: 'IVA en basis points (1900 = 19%)', type: 'number', group: 'Impuestos' },
  { key: 'store.shipping_flat_rate', label: 'Tarifa plana envío (CLP)', type: 'number', group: 'Envíos' },
  { key: 'store.shipping_free_threshold', label: 'Umbral envío gratis (CLP)', type: 'number', group: 'Envíos' },
  // store.bank_details se edita en /admin/payments (se mantiene en Setting para
  // compatibilidad con el ManualPaymentProvider existente).
  { key: 'store.email_from', label: 'Remitente de emails', type: 'email', group: 'Emails' },
  { key: 'trash.product_retention_days', label: 'Días en papelera antes del borrado definitivo (0 = nunca)', type: 'number', group: 'Papelera' },
] as const;

export type KnownSettingKey = (typeof KNOWN_SETTINGS)[number]['key'];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAll() {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    // Return known settings (with schema) merged with any unknown keys found.
    const knownKeys = new Set(KNOWN_SETTINGS.map((s) => s.key));
    const knownItems = KNOWN_SETTINGS.map((s) => ({
      ...s,
      value: map.get(s.key) ?? null,
    }));
    const unknownItems = rows
      .filter(
        (r) =>
          !knownKeys.has(r.key as KnownSettingKey) &&
          !r.key.startsWith(EMAIL_TEMPLATE_SETTING_PREFIX) &&
          !r.key.startsWith(ANALYTICS_SETTING_PREFIX) &&
          !r.key.startsWith(REVIEWS_SETTING_PREFIX),
      )
      .map((r) => ({
        key: r.key,
        label: r.key,
        type: 'json' as const,
        group: 'Otros',
        value: r.value,
      }));
    return [...knownItems, ...unknownItems];
  }

  async getByKey(key: string) {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) throw new NotFoundException('Setting no encontrado');
    return row;
  }

  async upsert(
    key: string,
    value: unknown,
    actor: { id: string; email: string },
  ) {
    const before = await this.prisma.setting.findUnique({ where: { key } });
    const row = await this.prisma.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: before ? 'update' : 'create',
      entityType: 'setting',
      entityId: key,
      before: before ? { value: before.value } : undefined,
      after: { value: row.value },
    });
    return row;
  }
}
