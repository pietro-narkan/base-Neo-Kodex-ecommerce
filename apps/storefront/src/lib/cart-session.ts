const CART_SESSION_KEY = 'nk_cart_session';

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
  const fresh = crypto.randomUUID();
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
