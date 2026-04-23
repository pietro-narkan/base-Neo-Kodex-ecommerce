import {
  All,
  Body,
  Controller,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';

import { Public } from '../auth/decorators/public.decorator';
import { OrdersService } from '../orders/orders.service';
import { PaymentService } from '../providers/payment.service';

/**
 * Callback de Webpay Plus. Transbank redirige el navegador del cliente acá
 * tras el formulario de pago. Puede llegar 4 combinaciones de parámetros —
 * las resolvemos antes de tocar el commit (ver doc de Transbank).
 *
 *   Caso                               | token_ws | TBK_TOKEN | otros
 *   -----------------------------------|----------|-----------|------
 *   (1) Pago OK o rechazo del banco    |   sí     |    no     |  —
 *   (2) Usuario anuló                  |   no     |    sí     |  TBK_ID_SESION, TBK_ORDEN_COMPRA
 *   (3) Timeout del formulario         |   no     |    no     |  TBK_ID_SESION, TBK_ORDEN_COMPRA
 *   (4) Error + click volver al sitio  |   sí     |    sí     |  —  (no commitear)
 *
 * Transbank puede venir por POST (caso normal) o GET (recuperación de tab).
 * Tomamos params tanto de body como de query para cubrir ambos. Redirigimos
 * al storefront con el orderNumber para que el cliente vea su confirmación.
 */
@Controller('payments/webpay')
export class WebpayReturnController {
  private readonly logger = new Logger('WebpayReturn');

  constructor(
    private readonly payment: PaymentService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @All('return')
  async handleReturn(
    @Body() body: Record<string, string> | undefined,
    @Query() query: Record<string, string>,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const src = { ...(body ?? {}), ...query };
    const tokenWs = src.token_ws;
    const tbkToken = src.TBK_TOKEN;
    const tbkSession = src.TBK_ID_SESION;
    const tbkOrder = src.TBK_ORDEN_COMPRA;

    const storefront = this.storefrontUrl();

    // Caso (4): ambos tokens → error, no commit.
    if (tokenWs && tbkToken) {
      this.logger.warn(
        `return caso-error token_ws+TBK_TOKEN presentes — NO commit`,
      );
      return this.redirect(
        reply,
        `${storefront}/checkout/rechazado?motivo=error`,
      );
    }

    // Caso (1): pago normal → commit
    if (tokenWs) {
      try {
        const commit = await this.payment.commit(tokenWs, 'webpay');
        const confirmed = await this.orders.confirmWebpayPayment(tokenWs, {
          status: commit.status,
          externalReference: commit.externalReference,
        });
        if (
          confirmed.state === 'paid' ||
          confirmed.state === 'already_paid'
        ) {
          return this.redirect(
            reply,
            `${storefront}/checkout/exito?orden=${encodeURIComponent(confirmed.orderNumber ?? '')}`,
          );
        }
        return this.redirect(
          reply,
          `${storefront}/checkout/rechazado?orden=${encodeURIComponent(confirmed.orderNumber ?? '')}`,
        );
      } catch (err) {
        this.logger.error(
          `commit falló token_ws=${tokenWs.substring(0, 8)}…: ${(err as Error).message}`,
        );
        return this.redirect(
          reply,
          `${storefront}/checkout/rechazado?motivo=error`,
        );
      }
    }

    // Caso (2) y (3): TBK_TOKEN (anulación) o solo session+order (timeout).
    const orderNumber =
      tbkSession && (await this.orders.findOrderNumberById(tbkSession));
    const motivo = tbkToken ? 'anulado' : 'timeout';
    const suffix = orderNumber
      ? `?orden=${encodeURIComponent(orderNumber)}&motivo=${motivo}`
      : `?motivo=${motivo}`;
    this.logger.log(
      `return caso-${motivo} session=${tbkSession ?? '—'} orden=${tbkOrder ?? '—'}`,
    );
    return this.redirect(reply, `${storefront}/checkout/anulado${suffix}`);
  }

  private storefrontUrl(): string {
    return (
      this.config.get<string>('STOREFRONT_URL') ??
      this.config.get<string>('PUBLIC_URL') ??
      'http://localhost:3002'
    ).replace(/\/$/, '');
  }

  private async redirect(reply: FastifyReply, url: string): Promise<void> {
    // 303 See Other fuerza al browser a pasar a GET en el próximo request,
    // correcto para redirigir después de un POST.
    await reply.status(303).header('Location', url).send();
  }
}
