/**
 * Catálogo de plantillas de email editables desde /admin/emails.
 *
 * Cada template tiene:
 *   - id: clave estable usada por el código que envía el email
 *   - label / description: para el UI
 *   - audience: 'customer' | 'admin' (a quién le llega)
 *   - placeholders: variables disponibles para el redactor
 *   - defaults: subject + html originales (se usan como fallback si el admin
 *     no editó la plantilla y como preview de "restaurar default")
 *   - mockData: valores de ejemplo para el preview
 *
 * Agregar una plantilla nueva:
 *   1. Agregar la entrada acá con sus defaults y mockData
 *   2. Llamar a EmailTemplatesService.render(id, vars) desde donde se envía
 */

export type TemplateAudience = 'customer' | 'admin';

export interface TemplatePlaceholder {
  name: string;
  description: string;
}

export interface TemplateDefinition {
  id: string;
  label: string;
  description: string;
  audience: TemplateAudience;
  placeholders: TemplatePlaceholder[];
  defaults: { subject: string; html: string };
  mockData: Record<string, string>;
}

const sampleItemsHtml =
  '<li>Silla Madera (Roble) × 2 — $59.980</li><li>Mesa Comedor × 1 — $189.990</li>';

const ORDER_CREATED: TemplateDefinition = {
  id: 'order.created',
  label: 'Pedido recibido (en espera de pago)',
  description:
    'Se envía al cliente apenas termina el checkout, con el resumen del pedido y las instrucciones de pago.',
  audience: 'customer',
  placeholders: [
    { name: 'firstName', description: 'Nombre del cliente' },
    { name: 'orderNumber', description: 'Número de orden (ej. NK-000123)' },
    { name: 'itemsHtml', description: 'Lista de ítems ya formateada (<li>...)' },
    { name: 'subtotal', description: 'Subtotal formateado en CLP' },
    { name: 'discount', description: 'Descuento aplicado en CLP' },
    { name: 'shipping', description: 'Costo de envío en CLP' },
    { name: 'total', description: 'Total final en CLP' },
    {
      name: 'paymentInstructionsBlock',
      description:
        'Bloque HTML con las instrucciones de pago (vacío si el proveedor no las entregó)',
    },
  ],
  defaults: {
    subject: 'Orden recibida — {{orderNumber}}',
    html: `<h2>¡Gracias por tu compra!</h2>
<p>Hola <strong>{{firstName}}</strong>, recibimos tu orden <strong>{{orderNumber}}</strong>.</p>
<ul>{{itemsHtml}}</ul>
<table>
  <tr><td>Subtotal</td><td style="text-align:right">\${{subtotal}}</td></tr>
  <tr><td>Descuento</td><td style="text-align:right">-\${{discount}}</td></tr>
  <tr><td>Envío</td><td style="text-align:right">\${{shipping}}</td></tr>
  <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>\${{total}}</strong></td></tr>
</table>
{{paymentInstructionsBlock}}
<p>Te avisaremos cuando confirmemos el pago.</p>`,
  },
  mockData: {
    firstName: 'María',
    orderNumber: 'NK-000123',
    itemsHtml: sampleItemsHtml,
    subtotal: '249.970',
    discount: '0',
    shipping: '5.990',
    total: '255.960',
    paymentInstructionsBlock:
      '<h3>Instrucciones de pago</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;white-space:pre-wrap;">Transferencia a cuenta corriente Banco Ejemplo\nNº 1234567-8\nRUT 76.123.456-7</pre>',
  },
};

const ORDER_PAID: TemplateDefinition = {
  id: 'order.paid',
  label: 'Pago confirmado',
  description: 'Se envía al cliente cuando el pago pasa a estado PAID.',
  audience: 'customer',
  placeholders: [
    { name: 'firstName', description: 'Nombre del cliente' },
    { name: 'orderNumber', description: 'Número de orden' },
    { name: 'itemsHtml', description: 'Lista de ítems en HTML' },
    { name: 'total', description: 'Total pagado en CLP' },
  ],
  defaults: {
    subject: 'Pago confirmado — {{orderNumber}}',
    html: `<h2>¡Pago confirmado!</h2>
<p>Hola <strong>{{firstName}}</strong>, confirmamos el pago de tu orden <strong>{{orderNumber}}</strong>.</p>
<ul>{{itemsHtml}}</ul>
<p><strong>Total pagado: \${{total}}</strong></p>
<p>Estamos preparando tu envío.</p>`,
  },
  mockData: {
    firstName: 'María',
    orderNumber: 'NK-000123',
    itemsHtml: sampleItemsHtml,
    total: '255.960',
  },
};

const ORDER_FULFILLED: TemplateDefinition = {
  id: 'order.fulfilled',
  label: 'Pedido despachado',
  description:
    'Se envía al marcar la orden como FULFILLED, con código de seguimiento si existe.',
  audience: 'customer',
  placeholders: [
    { name: 'firstName', description: 'Nombre del cliente' },
    { name: 'orderNumber', description: 'Número de orden' },
    { name: 'itemsHtml', description: 'Lista de ítems en HTML' },
    {
      name: 'trackingBlock',
      description:
        'Bloque HTML con el código de seguimiento (vacío si la orden no tiene tracking cargado)',
    },
  ],
  defaults: {
    subject: 'Tu pedido fue despachado — {{orderNumber}}',
    html: `<h2>Tu pedido está en camino</h2>
<p>Hola <strong>{{firstName}}</strong>, despachamos tu orden <strong>{{orderNumber}}</strong>.</p>
<ul>{{itemsHtml}}</ul>
{{trackingBlock}}
<p>Gracias por tu compra.</p>`,
  },
  mockData: {
    firstName: 'María',
    orderNumber: 'NK-000123',
    itemsHtml: sampleItemsHtml,
    trackingBlock:
      '<p><strong>Código de seguimiento:</strong> CH123456789CL <em>(Chilexpress)</em></p>',
  },
};

const ORDER_CANCELLED: TemplateDefinition = {
  id: 'order.cancelled',
  label: 'Pedido cancelado (fallido)',
  description:
    'Se envía al marcar la orden como CANCELLED. Incluye aviso de reembolso si ya estaba pagada.',
  audience: 'customer',
  placeholders: [
    { name: 'firstName', description: 'Nombre del cliente' },
    { name: 'orderNumber', description: 'Número de orden' },
    { name: 'itemsHtml', description: 'Lista de ítems en HTML' },
    { name: 'total', description: 'Total de la orden en CLP' },
    {
      name: 'refundNotice',
      description:
        'Mensaje sobre reembolso si la orden estaba pagada, o aviso genérico si no',
    },
  ],
  defaults: {
    subject: 'Orden cancelada — {{orderNumber}}',
    html: `<h2>Orden cancelada</h2>
<p>Hola <strong>{{firstName}}</strong>, tu orden <strong>{{orderNumber}}</strong> fue cancelada.</p>
<ul>{{itemsHtml}}</ul>
<p><strong>Total:</strong> \${{total}}</p>
<p>{{refundNotice}}</p>`,
  },
  mockData: {
    firstName: 'María',
    orderNumber: 'NK-000123',
    itemsHtml: sampleItemsHtml,
    total: '255.960',
    refundNotice:
      'Si ya habías pagado, procesaremos el reembolso en las próximas 72 horas hábiles.',
  },
};

const ORDER_REFUNDED: TemplateDefinition = {
  id: 'order.refunded',
  label: 'Reembolso procesado',
  description: 'Se envía al marcar la orden como REFUNDED.',
  audience: 'customer',
  placeholders: [
    { name: 'firstName', description: 'Nombre del cliente' },
    { name: 'orderNumber', description: 'Número de orden' },
    { name: 'total', description: 'Monto reembolsado en CLP' },
  ],
  defaults: {
    subject: 'Reembolso procesado — {{orderNumber}}',
    html: `<h2>Reembolso procesado</h2>
<p>Hola <strong>{{firstName}}</strong>, procesamos el reembolso de tu orden <strong>{{orderNumber}}</strong>.</p>
<p><strong>Monto reembolsado:</strong> \${{total}}</p>
<p>El dinero puede tardar entre 3 y 10 días hábiles en aparecer en tu medio de pago.</p>`,
  },
  mockData: {
    firstName: 'María',
    orderNumber: 'NK-000123',
    total: '255.960',
  },
};

const ORDER_ADMIN_NEW: TemplateDefinition = {
  id: 'order.admin_new',
  label: 'Nueva orden (notificación admin)',
  description:
    'Se envía al email de contacto de la tienda (store.contact_email) cada vez que entra una orden.',
  audience: 'admin',
  placeholders: [
    { name: 'orderNumber', description: 'Número de orden' },
    { name: 'firstName', description: 'Nombre del cliente' },
    { name: 'lastName', description: 'Apellido del cliente' },
    { name: 'email', description: 'Email del cliente' },
    { name: 'phone', description: 'Teléfono (o "—" si no hay)' },
    { name: 'itemsHtml', description: 'Lista de ítems en HTML' },
    { name: 'subtotal', description: 'Subtotal en CLP' },
    { name: 'shipping', description: 'Envío en CLP' },
    { name: 'total', description: 'Total en CLP' },
    { name: 'paymentStatus', description: 'Estado de pago (PENDING/PAID/...)' },
  ],
  defaults: {
    subject: '[Admin] Nueva orden {{orderNumber}} — \${{total}}',
    html: `<h2>Nueva orden recibida</h2>
<p><strong>{{orderNumber}}</strong> — <strong>\${{total}}</strong></p>
<p>Cliente: <strong>{{firstName}} {{lastName}}</strong> ({{email}})<br>
Teléfono: {{phone}}</p>
<ul>{{itemsHtml}}</ul>
<table>
  <tr><td>Subtotal</td><td>\${{subtotal}}</td></tr>
  <tr><td>Envío</td><td>\${{shipping}}</td></tr>
  <tr><td><strong>Total</strong></td><td><strong>\${{total}}</strong></td></tr>
</table>
<p>Pago: <strong>{{paymentStatus}}</strong></p>`,
  },
  mockData: {
    orderNumber: 'NK-000123',
    firstName: 'María',
    lastName: 'González',
    email: 'maria@example.com',
    phone: '+56 9 1234 5678',
    itemsHtml: sampleItemsHtml,
    subtotal: '249.970',
    shipping: '5.990',
    total: '255.960',
    paymentStatus: 'PENDING',
  },
};

const CUSTOMER_WELCOME: TemplateDefinition = {
  id: 'customer.welcome',
  label: 'Bienvenida (registro de cliente)',
  description:
    'Se envía al cliente cuando se crea una cuenta nueva (no al upgradear una cuenta guest).',
  audience: 'customer',
  placeholders: [
    { name: 'firstName', description: 'Nombre del cliente (puede venir vacío)' },
  ],
  defaults: {
    subject: '¡Bienvenido/a a la tienda!',
    html: `<h2>¡Bienvenido/a!</h2>
<p>Hola <strong>{{firstName}}</strong>, tu cuenta fue creada exitosamente.</p>
<p>Ahora podés:</p>
<ul>
  <li>Ver el historial de tus compras</li>
  <li>Guardar direcciones de envío</li>
  <li>Hacer checkout más rápido</li>
</ul>
<p>Cualquier duda, respondé este email.</p>`,
  },
  mockData: {
    firstName: 'María',
  },
};

const PASSWORD_RESET: TemplateDefinition = {
  id: 'password.reset',
  label: 'Restablecer contraseña',
  description:
    'Se envía cuando un usuario (cliente o admin) solicita recuperar su contraseña.',
  audience: 'customer',
  placeholders: [
    { name: 'resetUrl', description: 'Link con el token para fijar la nueva contraseña' },
    { name: 'ttlMinutes', description: 'Minutos de validez del link' },
  ],
  defaults: {
    subject: 'Restablecer contraseña — Neo-Kodex',
    html: `<p>Hola,</p>
<p>Recibimos una solicitud para restablecer tu contraseña. Hacé clic en el link de abajo para crear una nueva (válido por {{ttlMinutes}} minutos):</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>Si no solicitaste este cambio, ignorá este email.</p>`,
  },
  mockData: {
    resetUrl: 'https://admin.neo-kodex.local/reset-password?token=abc123def456',
    ttlMinutes: '60',
  },
};

export const EMAIL_TEMPLATES: readonly TemplateDefinition[] = [
  ORDER_CREATED,
  ORDER_PAID,
  ORDER_FULFILLED,
  ORDER_CANCELLED,
  ORDER_REFUNDED,
  ORDER_ADMIN_NEW,
  CUSTOMER_WELCOME,
  PASSWORD_RESET,
] as const;

export type TemplateId = (typeof EMAIL_TEMPLATES)[number]['id'];

export function findTemplate(id: string): TemplateDefinition | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}

/** Clave en la tabla Setting donde se guarda el override (JSON { subject, html }). */
export function settingKeyFor(id: string): string {
  return `email.template.${id}`;
}

/** Prefijo común — útil para filtrar templates fuera de /admin/settings. */
export const EMAIL_TEMPLATE_SETTING_PREFIX = 'email.template.';

// ============================================================
// Renderer
// ============================================================

/**
 * Reemplaza `{{var}}` por el valor correspondiente. Si una variable no está
 * en `vars`, se deja como string vacío (para no filtrar `{{...}}` literal).
 * Soporta espacios alrededor: `{{ var }}`.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => {
    const value = vars[name];
    return value ?? '';
  });
}

/**
 * Deriva una versión de texto plano a partir del HTML. Convierte saltos de
 * bloque en newlines y strippea el resto de tags. Suficiente como fallback
 * para clientes que no renderizan HTML.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|table)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
