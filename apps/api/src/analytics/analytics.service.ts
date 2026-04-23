import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANALYTICS_TOOLS,
  type AnalyticsToolDefinition,
  emptyConfig,
  findAnalyticsTool,
  isStoredAnalyticsConfig,
  settingKeyForAnalytics,
  type StoredAnalyticsConfig,
} from './analytics.catalog';

export interface AnalyticsToolResponse {
  id: string;
  label: string;
  description: string;
  docsUrl: string;
  hasBodySnippet: boolean;
  headHint: string;
  bodyHint?: string;
  config: StoredAnalyticsConfig;
}

export interface PublicSnippetsResponse {
  head: string[]; // snippets a inyectar en <head> (en orden)
  body: string[]; // snippets a inyectar al abrir <body>
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAll(): Promise<AnalyticsToolResponse[]> {
    const configs = await this.loadAllConfigs();
    return ANALYTICS_TOOLS.map((tool) =>
      this.toResponse(tool, configs.get(tool.id) ?? emptyConfig()),
    );
  }

  async getOne(id: string): Promise<AnalyticsToolResponse> {
    const tool = findAnalyticsTool(id);
    if (!tool) throw new NotFoundException('Herramienta desconocida');
    const config = await this.loadConfig(id);
    return this.toResponse(tool, config ?? emptyConfig());
  }

  async update(
    id: string,
    input: { enabled: boolean; headHtml: string; bodyHtml: string },
    actor: { id: string; email: string },
  ): Promise<AnalyticsToolResponse> {
    const tool = findAnalyticsTool(id);
    if (!tool) throw new NotFoundException('Herramienta desconocida');

    const normalized: StoredAnalyticsConfig = {
      enabled: input.enabled,
      headHtml: input.headHtml,
      // Si la herramienta no soporta body, ignoramos lo que venga.
      bodyHtml: tool.hasBodySnippet ? input.bodyHtml : '',
    };

    const key = settingKeyForAnalytics(id);
    const before = await this.prisma.setting.findUnique({ where: { key } });
    const value: Prisma.InputJsonValue = { ...normalized };
    await this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: before ? 'update' : 'create',
      entityType: 'analytics_tool',
      entityId: id,
      before: before ? { value: before.value } : undefined,
      after: { value },
    });

    return this.getOne(id);
  }

  /** Borra la config → vuelve a "deshabilitada + vacía". */
  async reset(
    id: string,
    actor: { id: string; email: string },
  ): Promise<AnalyticsToolResponse> {
    const tool = findAnalyticsTool(id);
    if (!tool) throw new NotFoundException('Herramienta desconocida');

    const key = settingKeyForAnalytics(id);
    const before = await this.prisma.setting.findUnique({ where: { key } });
    if (before) {
      await this.prisma.setting.delete({ where: { key } });
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'delete',
        entityType: 'analytics_tool',
        entityId: id,
        before: { value: before.value },
      });
    }
    return this.getOne(id);
  }

  /**
   * Snippets que el storefront público tiene que inyectar. Solo devuelve las
   * herramientas habilitadas. El orden es el del catálogo (GA → GTM → Meta →
   * Clarity) para que el comportamiento sea determinístico.
   */
  async publicSnippets(): Promise<PublicSnippetsResponse> {
    const configs = await this.loadAllConfigs();
    const head: string[] = [];
    const body: string[] = [];
    for (const tool of ANALYTICS_TOOLS) {
      const config = configs.get(tool.id);
      if (!config || !config.enabled) continue;
      if (config.headHtml.trim()) head.push(config.headHtml);
      if (tool.hasBodySnippet && config.bodyHtml.trim()) {
        body.push(config.bodyHtml);
      }
    }
    return { head, body };
  }

  // ===== Helpers =====

  private async loadConfig(id: string): Promise<StoredAnalyticsConfig | null> {
    const row = await this.prisma.setting.findUnique({
      where: { key: settingKeyForAnalytics(id) },
    });
    if (!row) return null;
    return isStoredAnalyticsConfig(row.value) ? row.value : null;
  }

  private async loadAllConfigs(): Promise<Map<string, StoredAnalyticsConfig>> {
    const keys = ANALYTICS_TOOLS.map((t) => settingKeyForAnalytics(t.id));
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map<string, StoredAnalyticsConfig>();
    for (const r of rows) {
      if (!isStoredAnalyticsConfig(r.value)) continue;
      const id = r.key.replace(/^analytics\./, '');
      map.set(id, r.value);
    }
    return map;
  }

  private toResponse(
    tool: AnalyticsToolDefinition,
    config: StoredAnalyticsConfig,
  ): AnalyticsToolResponse {
    return {
      id: tool.id,
      label: tool.label,
      description: tool.description,
      docsUrl: tool.docsUrl,
      hasBodySnippet: tool.hasBodySnippet,
      headHint: tool.headHint,
      bodyHint: tool.bodyHint,
      config,
    };
  }
}
