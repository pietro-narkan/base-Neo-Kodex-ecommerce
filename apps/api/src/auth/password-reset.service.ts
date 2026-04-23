import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserKind } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../providers/email.service';

const TOKEN_TTL_MINUTES = 60;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Request a password reset. Intentionally returns success even if the email
   * doesn't exist — this prevents email enumeration attacks. The email is only
   * sent if a matching user is found.
   */
  async requestReset(email: string, userKind: UserKind): Promise<{ ok: true }> {
    const user =
      userKind === 'ADMIN'
        ? await this.prisma.admin.findUnique({ where: { email } })
        : await this.prisma.customer.findUnique({ where: { email } });

    if (!user || (userKind === 'ADMIN' && !(user as { active: boolean }).active)) {
      await this.audit.log({
        actorEmail: email,
        action: 'password.reset.requested',
        entityType: userKind.toLowerCase(),
        metadata: { reason: 'user_not_found' },
      });
      return { ok: true }; // don't reveal whether email exists
    }

    // Invalidate any pending tokens for this user.
    await this.prisma.passwordResetToken.updateMany({
      where: { userKind, userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex'); // 64 chars, secure
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

    await this.prisma.passwordResetToken.create({
      data: { userKind, userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = this.buildResetUrl(rawToken, userKind);
    await this.email.send({
      to: email,
      subject: 'Restablecer contraseña — Neo-Kodex',
      html: `<p>Hola,</p>
<p>Recibimos una solicitud para restablecer tu contraseña. Hacé clic en el link de abajo para crear una nueva (válido por ${TOKEN_TTL_MINUTES} minutos):</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>Si no solicitaste este cambio, ignorá este email.</p>`,
      text: `Para restablecer tu contraseña visitá: ${resetUrl}\n(Válido por ${TOKEN_TTL_MINUTES} minutos. Ignorá este mensaje si no lo solicitaste.)`,
    });

    await this.audit.log({
      actorId: user.id,
      actorEmail: email,
      action: 'password.reset.requested',
      entityType: userKind.toLowerCase(),
      entityId: user.id,
    });

    return { ok: true };
  }

  async confirmReset(
    rawToken: string,
    userKind: UserKind,
    newPassword: string,
  ): Promise<{ ok: true }> {
    // We don't know the tokenHash, so we must iterate over unexpired
    // unused tokens of the given userKind and bcrypt-compare. For a small
    // number of pending tokens this is fine; if it becomes a perf concern,
    // we can switch to HMAC(secret, token) for constant-time lookup.
    const candidates = await this.prisma.passwordResetToken.findMany({
      where: {
        userKind,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let matched: (typeof candidates)[number] | undefined;
    for (const c of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(rawToken, c.tokenHash)) {
        matched = c;
        break;
      }
    }

    if (!matched) {
      throw new BadRequestException('Token inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      userKind === 'ADMIN'
        ? this.prisma.admin.update({
            where: { id: matched.userId },
            data: { passwordHash },
          })
        : this.prisma.customer.update({
            where: { id: matched.userId },
            data: { passwordHash },
          }),
      this.prisma.passwordResetToken.update({
        where: { id: matched.id },
        data: { usedAt: new Date() },
      }),
    ]);

    const userEmail =
      userKind === 'ADMIN'
        ? (await this.prisma.admin.findUnique({ where: { id: matched.userId } }))?.email
        : (await this.prisma.customer.findUnique({ where: { id: matched.userId } }))?.email;
    await this.audit.log({
      actorId: matched.userId,
      actorEmail: userEmail ?? 'unknown',
      action: 'password.reset.confirmed',
      entityType: userKind.toLowerCase(),
      entityId: matched.userId,
    });

    return { ok: true };
  }

  private buildResetUrl(rawToken: string, userKind: UserKind): string {
    const base =
      userKind === 'ADMIN'
        ? this.config.get<string>('ADMIN_URL') ?? 'http://localhost:3000'
        : this.config.get<string>('STOREFRONT_URL') ?? 'http://localhost:3002';
    const url = new URL('/reset-password', base);
    url.searchParams.set('token', rawToken);
    return url.toString();
  }
}
