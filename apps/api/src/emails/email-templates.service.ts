import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../providers/email.service';
import {
  EMAIL_TEMPLATES,
  findTemplate,
  htmlToText,
  renderTemplate,
  settingKeyFor,
  type TemplateDefinition,
} from './email-templates.catalog';

interface StoredOverride {
  subject?: string;
  html?: string;
}

function isStoredOverride(value: unknown): value is StoredOverride {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.subject === undefined || typeof v.subject === 'string') &&
    (v.html === undefined || typeof v.html === 'string')
  );
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateResponse {
  id: string;
  label: string;
  description: string;
  audience: TemplateDefinition['audience'];
  placeholders: TemplateDefinition['placeholders'];
  defaults: { subject: string; html: string };
  current: { subject: string; html: string };
  isCustomized: boolean;
  mockData: Record<string, string>;
}

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** Lista los templates del catálogo con su estado actual (default vs override). */
  async listAll(): Promise<TemplateResponse[]> {
    const overrides = await this.loadAllOverrides();
    return EMAIL_TEMPLATES.map((t) => this.toResponse(t, overrides.get(t.id)));
  }

  async getOne(id: string): Promise<TemplateResponse> {
    const def = findTemplate(id);
    if (!def) throw new NotFoundException('Template desconocido');
    const override = await this.loadOverride(id);
    return this.toResponse(def, override);
  }

  async update(
    id: string,
    input: { subject: string; html: string },
    actor: { id: string; email: string },
  ): Promise<TemplateResponse> {
    const def = findTemplate(id);
    if (!def) throw new NotFoundException('Template desconocido');

    const key = settingKeyFor(id);
    const before = await this.prisma.setting.findUnique({ where: { key } });
    const value: Prisma.InputJsonValue = {
      subject: input.subject,
      html: input.html,
    };
    await this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: before ? 'update' : 'create',
      entityType: 'email_template',
      entityId: id,
      before: before ? { value: before.value } : undefined,
      after: { value },
    });

    return this.getOne(id);
  }

  /** Borra el override → vuelve al default del catálogo. */
  async reset(
    id: string,
    actor: { id: string; email: string },
  ): Promise<TemplateResponse> {
    const def = findTemplate(id);
    if (!def) throw new NotFoundException('Template desconocido');

    const key = settingKeyFor(id);
    const before = await this.prisma.setting.findUnique({ where: { key } });
    if (before) {
      await this.prisma.setting.delete({ where: { key } });
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'delete',
        entityType: 'email_template',
        entityId: id,
        before: { value: before.value },
      });
    }
    return this.getOne(id);
  }

  /** Renderiza con los mockData del catálogo — usado por el preview del admin. */
  async preview(id: string): Promise<RenderedEmail> {
    const def = findTemplate(id);
    if (!def) throw new NotFoundException('Template desconocido');
    return this.render(id, def.mockData);
  }

  /**
   * Envía un correo de prueba al address indicado, usando los mockData del
   * catálogo. Si el admin pasa `override` (drafts sin guardar), se usa ese
   * contenido; si no, cae al override guardado o al default del catálogo.
   * Devuelve el nombre del proveedor activo para que el UI pueda avisar cuando
   * el provider es "console"/"noop" y el mail no sale de verdad.
   */
  async sendTest(
    id: string,
    to: string,
    override: { subject?: string; html?: string } | undefined,
    actor: { id: string; email: string },
  ): Promise<{ ok: true; provider: string }> {
    const def = findTemplate(id);
    if (!def) throw new NotFoundException('Template desconocido');

    const stored = await this.loadOverride(id);
    const subjectTpl =
      override?.subject ?? stored?.subject ?? def.defaults.subject;
    const htmlTpl = override?.html ?? stored?.html ?? def.defaults.html;

    const subject = `[PRUEBA] ${renderTemplate(subjectTpl, def.mockData)}`;
    const html = renderTemplate(htmlTpl, def.mockData);
    const text = htmlToText(html);

    const envelope = await this.loadEnvelope();
    await this.email.send({ to, subject, html, text, ...envelope, tags: [id, 'test'] });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'email.test_sent',
      entityType: 'email_template',
      entityId: id,
      metadata: { to, provider: this.email.providerName },
    });

    return { ok: true, provider: this.email.providerName };
  }

  /**
   * Render usado por el código que manda emails de verdad. Si el admin editó
   * la plantilla en /admin/emails usa ese override; si no, el default del
   * catálogo. Nunca tira — si el id es inválido loggea y devuelve un email
   * mínimo para no romper el flujo de negocio.
   */
  async render(id: string, vars: Record<string, string>): Promise<RenderedEmail> {
    const def = findTemplate(id);
    if (!def) {
      this.logger.error(`render: template id desconocido "${id}"`);
      return {
        subject: `[${id}]`,
        html: '',
        text: '',
      };
    }
    const override = await this.loadOverride(id);
    const subjectTpl = override?.subject ?? def.defaults.subject;
    const htmlTpl = override?.html ?? def.defaults.html;
    const subject = renderTemplate(subjectTpl, vars);
    const html = renderTemplate(htmlTpl, vars);
    return { subject, html, text: htmlToText(html) };
  }

  /**
   * Atajo que renderiza y manda el mail en un solo paso. Usa EmailService.send,
   * que ya es best-effort (no tira).
   */
  async renderAndSend(
    id: string,
    to: string,
    vars: Record<string, string>,
  ): Promise<void> {
    const rendered = await this.render(id, vars);
    const envelope = await this.loadEnvelope();
    await this.email.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...envelope,
      tags: [id],
    });
  }

  // ===== Helpers =====

  /**
   * Lee el "envelope" (from / fromName / replyTo) desde Settings editables
   * en /admin/configuración. El cliente puede cambiarlos sin redeploy.
   *
   * - `store.email_from` → from-address (debe estar verificado en el panel
   *   del provider; si falta, BrevoEmailProvider skippea el envío con un warn)
   * - `store.email_from_name` → display name (fallback a `store.name`)
   * - `store.contact_email` → reply-to (donde caen las respuestas del cliente)
   */
  private async loadEnvelope(): Promise<{
    from?: string;
    fromName?: string;
    replyTo?: string;
  }> {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: {
          in: [
            'store.email_from',
            'store.email_from_name',
            'store.contact_email',
            'store.name',
          ],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const str = (key: string): string | undefined => {
      const v = map.get(key);
      return typeof v === 'string' && v.trim() ? v.trim() : undefined;
    };
    return {
      from: str('store.email_from'),
      fromName: str('store.email_from_name') ?? str('store.name'),
      replyTo: str('store.contact_email'),
    };
  }

  private async loadOverride(id: string): Promise<StoredOverride | null> {
    const row = await this.prisma.setting.findUnique({
      where: { key: settingKeyFor(id) },
    });
    if (!row) return null;
    return isStoredOverride(row.value) ? row.value : null;
  }

  private async loadAllOverrides(): Promise<Map<string, StoredOverride>> {
    const keys = EMAIL_TEMPLATES.map((t) => settingKeyFor(t.id));
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map<string, StoredOverride>();
    for (const r of rows) {
      if (!isStoredOverride(r.value)) continue;
      const id = r.key.replace(/^email\.template\./, '');
      map.set(id, r.value);
    }
    return map;
  }

  private toResponse(
    def: TemplateDefinition,
    override: StoredOverride | null | undefined,
  ): TemplateResponse {
    const current = {
      subject: override?.subject ?? def.defaults.subject,
      html: override?.html ?? def.defaults.html,
    };
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      audience: def.audience,
      placeholders: def.placeholders,
      defaults: def.defaults,
      current,
      isCustomized: Boolean(override),
      mockData: def.mockData,
    };
  }
}
