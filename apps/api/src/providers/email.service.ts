import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Brevo, BrevoClient, BrevoError } from '@getbrevo/brevo';

// ============================================================
// Interface
// ============================================================

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Email del remitente (sin nombre). El nombre va en `fromName`. */
  from?: string;
  fromName?: string;
  /** Email donde el cliente responde si hace "Responder" en su gestor. */
  replyTo?: string;
  /** Tags para agrupar/filtrar en el dashboard del provider. */
  tags?: string[];
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

// ============================================================
// Implementaciones default
// ============================================================

/**
 * Loggea el mail en consola. Útil en desarrollo.
 */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('ConsoleEmailProvider');

  async send(msg: EmailMessage): Promise<void> {
    const sep = '='.repeat(60);
    const body = msg.text ?? msg.html.replace(/<[^>]+>/g, '');
    const fromLine = msg.fromName
      ? `${msg.fromName} <${msg.from ?? 'no-reply@neo-kodex.local'}>`
      : (msg.from ?? 'no-reply@neo-kodex.local');
    const tags = msg.tags?.length ? ` [${msg.tags.join(',')}]` : '';
    this.logger.log(
      `\n${sep}\nFROM: ${fromLine}\nTO:   ${msg.to}${msg.replyTo ? `\nREPLY-TO: ${msg.replyTo}` : ''}\nSUBJ: ${msg.subject}${tags}\n${'-'.repeat(60)}\n${body}\n${sep}`,
    );
  }
}

/** Descarta el mail silenciosamente. Útil para tests. */
class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop';
  async send(_msg: EmailMessage): Promise<void> {
    // intencional
  }
}

/**
 * Envía vía Brevo (https://brevo.com) con su SDK oficial.
 *
 * Requiere `BREVO_API_KEY` (env, secreto). El email/nombre remitente
 * vienen en cada mensaje (los arma EmailTemplatesService a partir de
 * Settings editables desde /admin/configuración), así un cambio en el
 * admin tiene efecto sin restart.
 */
class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';
  private readonly logger = new Logger('BrevoEmailProvider');
  private readonly client: BrevoClient;

  constructor(apiKey: string) {
    this.client = new BrevoClient({ apiKey });
  }

  async send(msg: EmailMessage): Promise<void> {
    if (!msg.from) {
      this.logger.warn(
        `Falta from-address (Setting "store.email_from") — skip envío a ${msg.to}`,
      );
      return;
    }
    const request: Brevo.SendTransacEmailRequest = {
      sender: { email: msg.from, name: msg.fromName },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      replyTo: msg.replyTo ? { email: msg.replyTo } : undefined,
      tags: msg.tags,
    };
    try {
      const res = await this.client.transactionalEmails.sendTransacEmail(request);
      const id = res.messageId ?? res.messageIds?.[0];
      this.logger.log(`Brevo send OK → ${msg.to} (messageId=${id ?? 'unknown'})`);
    } catch (err) {
      const detail =
        err instanceof BrevoError
          ? `status=${err.statusCode ?? '?'} body=${JSON.stringify(err.body)}`
          : (err as Error).message;
      throw new Error(`Brevo send falló: ${detail}`);
    }
  }
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class EmailService {
  private readonly provider: EmailProvider;
  private readonly logger = new Logger(EmailService.name);

  constructor(config: ConfigService) {
    const name = config.get<string>('EMAIL_PROVIDER') ?? 'console';
    switch (name) {
      case 'console':
        this.provider = new ConsoleEmailProvider();
        break;
      case 'noop':
        this.provider = new NoopEmailProvider();
        break;
      case 'brevo': {
        const apiKey = config.get<string>('BREVO_API_KEY');
        if (!apiKey) {
          throw new Error(
            'EMAIL_PROVIDER=brevo requiere BREVO_API_KEY en env',
          );
        }
        this.provider = new BrevoEmailProvider(apiKey);
        break;
      }
      default:
        throw new Error(`EMAIL_PROVIDER desconocido: ${name}`);
    }
    this.logger.log(`Email provider activo: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Envía el mail. Nunca lanza — los errores se loggean
   * pero no deben romper el flujo de negocio (checkout, status, etc.).
   */
  async send(message: EmailMessage): Promise<void> {
    try {
      await this.provider.send(message);
    } catch (err) {
      this.logger.error(
        `Email send falló (${this.provider.name}) → ${message.to}: ${(err as Error).message}`,
      );
    }
  }
}
