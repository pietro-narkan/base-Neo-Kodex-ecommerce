import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ReviewStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// Settings — stored as individual Setting rows bajo el prefijo "reviews."
// ============================================================

const SETTING_ENABLED = 'reviews.enabled';
const SETTING_STARS_ENABLED = 'reviews.stars_enabled';
const SETTING_STARS_REQUIRED = 'reviews.stars_required';

export const REVIEWS_SETTING_PREFIX = 'reviews.';

export interface ReviewsSettings {
  enabled: boolean;
  starsEnabled: boolean;
  starsRequired: boolean;
}

const DEFAULT_SETTINGS: ReviewsSettings = {
  enabled: false,
  starsEnabled: true,
  starsRequired: false,
};

// ============================================================
// DTO-shaped inputs
// ============================================================

export interface CreateReviewInput {
  productId: string;
  email: string;
  firstName: string;
  rating?: number | null;
  title?: string | null;
  comment: string;
}

export interface UpdateSettingsInput {
  enabled: boolean;
  starsEnabled: boolean;
  starsRequired: boolean;
}

export interface ProductReviewPublic {
  id: string;
  firstName: string;
  rating: number | null;
  title: string | null;
  comment: string;
  adminReply: string | null;
  adminReplyAt: Date | null;
  createdAt: Date;
  isVerifiedPurchase: boolean;
}

export interface ProductReviewAdmin extends ProductReviewPublic {
  productId: string;
  productName?: string;
  email: string;
  status: ReviewStatus;
  updatedAt: Date;
}

export interface ReviewStats {
  count: number;
  average: number; // 0 if no ratings
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- Settings -----

  async getSettings(): Promise<ReviewsSettings> {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: {
          in: [SETTING_ENABLED, SETTING_STARS_ENABLED, SETTING_STARS_REQUIRED],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      enabled: toBool(map.get(SETTING_ENABLED), DEFAULT_SETTINGS.enabled),
      starsEnabled: toBool(
        map.get(SETTING_STARS_ENABLED),
        DEFAULT_SETTINGS.starsEnabled,
      ),
      starsRequired: toBool(
        map.get(SETTING_STARS_REQUIRED),
        DEFAULT_SETTINGS.starsRequired,
      ),
    };
  }

  async updateSettings(
    input: UpdateSettingsInput,
    actor: { id: string; email: string },
  ): Promise<ReviewsSettings> {
    const before = await this.getSettings();
    const pairs: Array<[string, boolean]> = [
      [SETTING_ENABLED, input.enabled],
      [SETTING_STARS_ENABLED, input.starsEnabled],
      [SETTING_STARS_REQUIRED, input.starsRequired],
    ];
    await this.prisma.$transaction(
      pairs.map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value: value as unknown as Prisma.InputJsonValue },
          create: { key, value: value as unknown as Prisma.InputJsonValue },
        }),
      ),
    );
    const after = await this.getSettings();
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      entityType: 'reviews_settings',
      before,
      after,
    });
    return after;
  }

  // ----- Public: eligibility + create -----

  /**
   * Verifica que `email` tenga alguna orden PAGADA que incluya al menos un
   * item cuyo variant pertenezca al producto dado. Es el check central del
   * flujo "Opción A" — match por email+producto sin login requerido.
   *
   * TODO (Opción B, futuro): reemplazar o complementar este check por un
   * token firmado que se envía por email cuando la orden pasa a PAID. El
   * cliente clickea el link y llega al form con email+producto ya bindeados
   * al token. Más resistente a spoofing pero requiere tener el provider de
   * email real activo (hoy en dev es "console").
   */
  async hasVerifiedPurchase(
    email: string,
    productId: string,
  ): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    const count = await this.prisma.order.count({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        paymentStatus: 'PAID',
        items: {
          some: { variant: { productId } },
        },
      },
    });
    return count > 0;
  }

  /** Devuelve si el email ya dejó una review para este producto (bloquea duplicados). */
  async hasExistingReview(email: string, productId: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const row = await this.prisma.productReview.findFirst({
      where: {
        productId,
        email: { equals: normalized, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return row !== null;
  }

  async checkEligibility(
    email: string,
    productId: string,
  ): Promise<{
    eligible: boolean;
    reason?: 'no_purchase' | 'already_reviewed' | 'product_not_found';
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) return { eligible: false, reason: 'product_not_found' };
    if (await this.hasExistingReview(email, productId)) {
      return { eligible: false, reason: 'already_reviewed' };
    }
    if (!(await this.hasVerifiedPurchase(email, productId))) {
      return { eligible: false, reason: 'no_purchase' };
    }
    return { eligible: true };
  }

  async createPublic(input: CreateReviewInput): Promise<{ ok: true }> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      throw new ForbiddenException('Las valoraciones están desactivadas.');
    }

    // Rating rules
    if (input.rating != null) {
      if (!settings.starsEnabled) {
        throw new BadRequestException(
          'Las puntuaciones con estrellas están desactivadas.',
        );
      }
      if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
        throw new BadRequestException('La puntuación debe ser un entero de 1 a 5.');
      }
    } else if (settings.starsEnabled && settings.starsRequired) {
      throw new BadRequestException('La puntuación es obligatoria.');
    }

    const comment = input.comment.trim();
    if (comment.length < 10) {
      throw new BadRequestException(
        'El comentario debe tener al menos 10 caracteres.',
      );
    }
    const firstName = input.firstName.trim();
    if (!firstName) {
      throw new BadRequestException('El nombre es obligatorio.');
    }

    const email = input.email.trim().toLowerCase();

    const elig = await this.checkEligibility(email, input.productId);
    if (!elig.eligible) {
      if (elig.reason === 'product_not_found') {
        throw new NotFoundException('Producto no encontrado.');
      }
      if (elig.reason === 'already_reviewed') {
        throw new ForbiddenException(
          'Ya dejaste una valoración para este producto.',
        );
      }
      throw new ForbiddenException(
        'No encontramos una compra tuya de este producto con ese email.',
      );
    }

    // Asociar al customer si existe (ayuda a listar "mis reviews" si algún día
    // lo necesitamos).
    const customer = await this.prisma.customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    await this.prisma.productReview.create({
      data: {
        productId: input.productId,
        email,
        firstName,
        customerId: customer?.id ?? null,
        rating: settings.starsEnabled ? input.rating ?? null : null,
        title: input.title?.trim() || null,
        comment,
        status: 'PENDING',
        isVerifiedPurchase: true,
      },
    });

    return { ok: true };
  }

  // ----- Public: listing -----

  async listApprovedByProduct(
    productId: string,
    pagination: { page?: number; limit?: number },
  ): Promise<{
    items: ProductReviewPublic[];
    total: number;
    page: number;
    limit: number;
    stats: ReviewStats;
  }> {
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.max(1, Math.min(100, pagination.limit ?? 10));
    const [items, total, stats] = await Promise.all([
      this.prisma.productReview.findMany({
        where: { productId, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          firstName: true,
          rating: true,
          title: true,
          comment: true,
          adminReply: true,
          adminReplyAt: true,
          createdAt: true,
          isVerifiedPurchase: true,
        },
      }),
      this.prisma.productReview.count({
        where: { productId, status: 'APPROVED' },
      }),
      this.getProductStats(productId),
    ]);
    return { items, total, page, limit, stats };
  }

  async getProductStats(productId: string): Promise<ReviewStats> {
    const approved = await this.prisma.productReview.findMany({
      where: { productId, status: 'APPROVED', rating: { not: null } },
      select: { rating: true },
    });
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewStats['breakdown'];
    let sum = 0;
    for (const r of approved) {
      if (r.rating != null && r.rating >= 1 && r.rating <= 5) {
        breakdown[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
        sum += r.rating;
      }
    }
    const count = approved.length;
    const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    return { count, average, breakdown };
  }

  // ----- Admin: listing + moderation -----

  async listAdmin(params: {
    status?: ReviewStatus;
    productId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: ProductReviewAdmin[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(100, params.limit ?? 25));
    const where: Prisma.ProductReviewWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.productId ? { productId: params.productId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { name: true } },
        },
      }),
      this.prisma.productReview.count({ where }),
    ]);
    const items: ProductReviewAdmin[] = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      email: r.email,
      firstName: r.firstName,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      adminReply: r.adminReply,
      adminReplyAt: r.adminReplyAt,
      status: r.status,
      isVerifiedPurchase: r.isVerifiedPurchase,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { items, total, page, limit };
  }

  async setStatus(
    id: string,
    status: ReviewStatus,
    actor: { id: string; email: string },
  ): Promise<void> {
    const before = await this.prisma.productReview.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Review no encontrada');
    if (before.status === status) return;
    await this.prisma.productReview.update({
      where: { id },
      data: { status },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: `review.${status.toLowerCase()}`,
      entityType: 'product_review',
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
  }

  async setReply(
    id: string,
    reply: string | null,
    actor: { id: string; email: string },
  ): Promise<void> {
    const before = await this.prisma.productReview.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Review no encontrada');
    const normalized = reply?.trim() || null;
    await this.prisma.productReview.update({
      where: { id },
      data: {
        adminReply: normalized,
        adminReplyAt: normalized ? new Date() : null,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: normalized ? 'review.reply' : 'review.reply_cleared',
      entityType: 'product_review',
      entityId: id,
      before: { adminReply: before.adminReply },
      after: { adminReply: normalized },
    });
  }

  async remove(id: string, actor: { id: string; email: string }): Promise<void> {
    const before = await this.prisma.productReview.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Review no encontrada');
    await this.prisma.productReview.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      entityType: 'product_review',
      entityId: id,
      before,
    });
  }
}

// ============================================================
// Helpers
// ============================================================

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}
