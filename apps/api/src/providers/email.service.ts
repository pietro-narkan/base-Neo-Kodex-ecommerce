import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ============================================================
// Interface
// ============================================================

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

// ============================================================
// Implementaciones default
// ============================================================

/**
 * Loggea el mail en consola. Útil en desarrollo — en producción
 * hay que pasar a Resend / SendGrid / SES / etc.
 */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('ConsoleEmailProvider');

  async send(msg: EmailMessage): Promise<void> {
    const sep = '='.repeat(60);
    const body = msg.text ?? msg.html.replace(/<[^>]+>/g, '');
    this.logger.log(
      `\n${sep}\nFROM: ${msg.from ?? 'no-reply@neo-kodex.local'}\nTO:   ${msg.to}\nSUBJ: ${msg.subject}\n${'-'.repeat(60)}\n${body}\n${sep}`,
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
      // case 'resend': this.provider = new ResendEmailProvider(config); break;
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
