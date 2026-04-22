'use client';

import { Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/lib/cart';
import { cn, formatCLP } from '@/lib/utils';

export default function CartPage() {
  const { cart, isLoading, updateItem, removeItem, applyCoupon, removeCoupon } =
    useCart();
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleUpdate(itemId: string, qty: number) {
    setBusy(itemId);
    try {
      await updateItem(itemId, qty);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(itemId: string) {
    setBusy(itemId);
    try {
      await removeItem(itemId);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    setCouponError(null);
    if (!couponCode.trim()) return;
    try {
      await applyCoupon(couponCode.trim());
      setCouponCode('');
    } catch (err) {
      setCouponError((err as Error).message);
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <ShoppingCart className="size-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Tu carrito está vacío</h1>
        <p className="text-muted-foreground mb-6">
          Agregá productos para continuar.
        </p>
        <Link href="/productos" className={cn(buttonVariants())}>
          Ir al catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight mb-8">Tu carrito</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-4">
          {cart.items.map((item) => {
            const firstMedia =
              item.variant.media[0] ?? item.variant.product.media[0];
            const lineTotal = item.variant.priceGross * item.quantity;
            return (
              <div
                key={item.id}
                className="flex gap-4 border rounded-lg p-4"
              >
                <div className="w-24 h-24 relative rounded-md border bg-muted/30 overflow-hidden flex-shrink-0">
                  {firstMedia ? (
                    <Image
                      src={firstMedia.url}
                      alt={firstMedia.alt ?? item.variant.product.name}
                      fill
                      sizes="100px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/productos/${item.variant.product.slug}`}
                        className="font-medium hover:underline block truncate"
                      >
                        {item.variant.product.name}
                      </Link>
                      {item.variant.name && (
                        <p className="text-sm text-muted-foreground truncate">
                          {item.variant.name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        SKU {item.variant.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={busy === item.id}
                      aria-label="Eliminar"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center border rounded-md">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy === item.id || item.quantity <= 1}
                        onClick={() =>
                          handleUpdate(item.id, item.quantity - 1)
                        }
                        type="button"
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={
                          busy === item.id ||
                          item.quantity >= item.variant.stock
                        }
                        onClick={() =>
                          handleUpdate(item.id, item.quantity + 1)
                        }
                        type="button"
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatCLP(lineTotal)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCLP(item.variant.priceGross)} c/u
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="border rounded-lg p-5 space-y-4 sticky top-20">
            <h2 className="font-semibold">Resumen</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCLP(cart.totals.subtotalGross)}</span>
              </div>
              {cart.totals.discountAmount > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>
                    Descuento
                    {cart.couponCode && (
                      <span className="text-xs font-mono ml-1">
                        ({cart.couponCode})
                      </span>
                    )}
                  </span>
                  <span>-{formatCLP(cart.totals.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span className="text-xs">Se calcula en el checkout</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
                <span>Total</span>
                <span>{formatCLP(cart.totals.total)}</span>
              </div>
            </div>

            <Link
              href="/checkout"
              className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
            >
              Ir al checkout
            </Link>

            <div className="pt-3 border-t">
              <h3 className="text-sm font-medium mb-2">Cupón</h3>
              {cart.couponCode ? (
                <div className="flex items-center justify-between text-sm rounded-md bg-muted/50 px-3 py-2">
                  <span className="font-mono font-medium">
                    {cart.couponCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCoupon()}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar cupón"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={couponCode}
                      onChange={(e) =>
                        setCouponCode(e.target.value.toUpperCase())
                      }
                      className="font-mono uppercase"
                      placeholder="CÓDIGO"
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Aplicar
                    </Button>
                  </div>
                  {couponError && (
                    <p className="text-xs text-destructive">{couponError}</p>
                  )}
                </form>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
