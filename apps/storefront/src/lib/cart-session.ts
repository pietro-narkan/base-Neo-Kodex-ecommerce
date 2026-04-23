const CART_SESSION_KEY = 'nk_cart_session';

// crypto.randomUUID() requires a secure context (HTTPS or localhost). Our
// provisional sslip.io deploys run on plain HTTP, so we fall back to
// crypto.getRandomValues (available in insecure contexts) or Math.random.
function generateUuidV4(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Obtiene o crea el sessionId del carrito del guest.
 * El storefront lo manda en el header `X-Cart-Session` en cada request
 * al carrito. Se persiste en localStorage hasta que el usuario se loguea
 * (ahí el backend puede mergear el cart via POST /cart/merge).
 */
export function getCartSession(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(CART_SESSION_KEY);
  if (existing) return existing;
  const fresh =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : generateUuidV4();
  localStorage.setItem(CART_SESSION_KEY, fresh);
  return fresh;
}

export function clearCartSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CART_SESSION_KEY);
}

export function cartSessionHeader(): Record<string, string> {
  const sid = getCartSession();
  return sid ? { 'X-Cart-Session': sid } : {};
}
