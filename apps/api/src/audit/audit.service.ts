import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    // Fire-and-forget: we never want audit logging to break a mutation.
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: entry.before as Prisma.InputJsonValue,
          after: entry.after as Prisma.InputJsonValue,
          metadata: entry.metadata as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Swallow — audit failures must never break the caller.
    }
  }

  async list(params: {
    limit?: number;
    cursor?: string;
    actorId?: string;
    entityType?: string;
    entityId?: string;
    fromDate?: Date;
    toDate?: Date;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const where: Prisma.AuditLogWhereInput = {
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.fromDate || params.toDate
        ? {
            createdAt: {
              ...(params.fromDate ? { gte: params.fromDate } : {}),
              ...(params.toDate ? { lte: params.toDate } : {}),
            },
          }
        : {}),
    };
    return this.prisma.auditLog.findMany({
      where,
      take: limit,
      ...(params.cursor
        ? { cursor: { id: params.cursor }, skip: 1 }
        : {}),
      orderBy: { createdAt: 'desc' },
    });
  }
}
