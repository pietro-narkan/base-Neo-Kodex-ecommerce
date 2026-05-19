export const WEBHOOK_EVENTS = [
  'order.created',
  'order.paid',
  'order.fulfilled',
  'order.cancelled',
  'order.refunded',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export const API_VERSION = '1.0' as const;

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

export interface WebhookPayload {
  id: string;
  event: WebhookEventName;
  data: Record<string, unknown>;
  timestamp: number;
  api_version: typeof API_VERSION;
}
