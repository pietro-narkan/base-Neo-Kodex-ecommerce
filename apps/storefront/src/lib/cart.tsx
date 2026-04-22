'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { apiDelete, apiGet, apiPatch, apiPost } from './api';
import { cartSessionHeader } from './cart-session';

interface Media {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

interface CartItem {
  id: string;
  quantity: number;
  variant: {
    id: string;
    name: string | null;
    sku: string;
    priceNet: number;
    priceGross: number;
    stock: number;
    product: {
      id: string;
      name: string;
      slug: string;
      media: Media[];
    };
    media: Media[];
  };
}

export interface CartTotals {
  subtotalNet: number;
  subtotalGross: number;
  taxAmount: number;
  discountAmount: number;
  shippingAmount: number;
  total: number;
}

export interface Cart {
  id: string;
  couponCode: string | null;
  items: CartItem[];
  totals: CartTotals;
}

interface CartContextValue {
  cart: Cart | null;
  count: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  addItem: (variantId: string, quantity: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const c = await apiGet<Cart>('/cart', cartSessionHeader());
      setCart(c);
    } catch {
      setCart(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (variantId: string, quantity: number) => {
      await apiPost(
        '/cart/items',
        { variantId, quantity },
        cartSessionHeader(),
      );
      await refresh();
    },
    [refresh],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      await apiPatch(
        `/cart/items/${itemId}`,
        { quantity },
        cartSessionHeader(),
      );
      await refresh();
    },
    [refresh],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      await apiDelete(`/cart/items/${itemId}`, cartSessionHeader());
      await refresh();
    },
    [refresh],
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      await apiPost('/cart/coupon', { code }, cartSessionHeader());
      await refresh();
    },
    [refresh],
  );

  const removeCoupon = useCallback(async () => {
    await apiDelete('/cart/coupon', cartSessionHeader());
    await refresh();
  }, [refresh]);

  const count = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        count,
        isLoading,
        refresh,
        addItem,
        updateItem,
        removeItem,
        applyCoupon,
        removeCoupon,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart debe usarse dentro de <CartProvider>');
  }
  return ctx;
}
