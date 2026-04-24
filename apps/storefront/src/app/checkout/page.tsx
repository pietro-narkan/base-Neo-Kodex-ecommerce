'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { cartSessionHeader } from '@/lib/cart-session';
import { cn, formatCLP } from '@/lib/utils';

const schema = z.object({
  email: z.string().email('Email inválido'),
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  phone: z.string().optional(),
  rut: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{7,8}-[\dkK]$/.test(v),
      'RUT inválido (formato: 12345678-9)',
    ),
  addr_line1: z.string().min(1, 'Requerido'),
  addr_line2: z.string().optional(),
  addr_city: z.string().min(1, 'Requerido'),
  addr_region: z.string().min(1, 'Requerido'),
  addr_postalCode: z.string().optional(),
  documentType: z.enum(['NONE', 'BOLETA', 'FACTURA']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  priceGross: number;
  subtotal: number;
}

interface PlacedOrder {
  id: string;
  orderNumber: string;
  email: string;
  firstName: string;
  total: number;
  subtotalGross: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  items: OrderItem[];
  paymentInstructions?: string;
  paymentRedirect?: {
    url: string;
    method: 'POST' | 'GET';
    params: Record<string, string>;
  };
}

interface PaymentMethod {
  id: 'manual' | 'webpay';
  name: string;
  description: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { cart, isLoading, refresh } = useCart();
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(
    null,
  );
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { documentType: 'NONE' },
  });

  useEffect(() => {
    if (user) {
      reset((prev) => ({ ...prev, email: user.email }));
    }
  }, [user, reset]);

  // Lista de métodos de pago habilitados por el admin — el cliente elige uno.
  useEffect(() => {
    apiGet<PaymentMethod[]>('/public/payments')
      .then((res) => {
        setPaymentMethods(res);
        if (res.length > 0) setSelectedMethod(res[0].id);
      })
      .catch(() => setPaymentMethods([]));
  }, []);

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || undefined,
        rut: data.rut || undefined,
        shippingAddress: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || undefined,
          line1: data.addr_line1,
          line2: data.addr_line2 || undefined,
          city: data.addr_city,
          region: data.addr_region,
          postalCode: data.addr_postalCode || undefined,
          country: 'CL',
        },
        documentType: data.documentType,
        paymentMethod: selectedMethod ?? undefined,
        notes: data.notes || undefined,
      };
      const order = await apiPost<PlacedOrder>(
        '/orders/checkout',
        payload,
        cartSessionHeader(),
      );
      setPlaced(order);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ===== Redirect a pasarela externa (Webpay etc.) =====
  if (placed?.paymentRedirect) {
    return <GatewayRedirect redirect={placed.paymentRedirect} />;
  }

  // ===== Estado de éxito =====
  if (placed) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <CheckCircle2 className="size-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-semibold tracking-tight">
            ¡Orden recibida!
          </h1>
          <p className="text-muted-foreground mt-2">
            Tu número de orden es{' '}
            <span className="font-mono font-semibold">
              {placed.orderNumber}
            </span>
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Te enviamos un email a {placed.email} con los detalles.
          </p>
        </div>

        {placed.paymentInstructions && (
          <div className="border rounded-lg p-5 mb-6 bg-muted/30">
            <h2 className="font-semibold mb-3">Instrucciones de pago</h2>
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {placed.paymentInstructions}
            </pre>
          </div>
        )}

        <div className="border rounded-lg p-5 mb-6">
          <h2 className="font-semibold mb-3">Resumen</h2>
          <div className="space-y-2 text-sm">
            {placed.items.map((i) => (
              <div key={i.id} className="flex justify-between">
                <span>
                  {i.productName}
                  {i.variantName && (
                    <span className="text-muted-foreground"> · {i.variantName}</span>
                  )}
                  <span className="text-muted-foreground"> × {i.quantity}</span>
                </span>
                <span>{formatCLP(i.subtotal)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
              <span>Total</span>
              <span>{formatCLP(placed.total)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-center">
          <Link href="/productos" className={cn(buttonVariants())}>
            Seguir comprando
          </Link>
          {user && (
            <Link
              href={`/cuenta/${placed.id}`}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Ver mi orden
            </Link>
          )}
        </div>
      </div>
    );
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
      <div className="container mx-auto px-4 py-16 text-center">
        <ShoppingCart className="size-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">
          Tu carrito está vacío
        </h1>
        <p className="text-muted-foreground mb-6">
          Agregá productos antes de ir al checkout.
        </p>
        <Link href="/productos" className={cn(buttonVariants())}>
          Ir al catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight mb-8">Checkout</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8"
      >
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="font-semibold">Datos de contacto</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" {...register('firstName')} />
                {errors.firstName && (
                  <p className="text-xs text-destructive">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellido</Label>
                <Input id="lastName" {...register('lastName')} />
                {errors.lastName && (
                  <p className="text-xs text-destructive">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" type="tel" {...register('phone')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rut">RUT (opcional, requerido para factura)</Label>
              <Input id="rut" {...register('rut')} placeholder="12345678-9" />
              {errors.rut && (
                <p className="text-xs text-destructive">{errors.rut.message}</p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Dirección de envío</h2>
            <div className="space-y-2">
              <Label htmlFor="addr_line1">Calle y número</Label>
              <Input id="addr_line1" {...register('addr_line1')} />
              {errors.addr_line1 && (
                <p className="text-xs text-destructive">
                  {errors.addr_line1.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr_line2">Depto / referencia (opcional)</Label>
              <Input id="addr_line2" {...register('addr_line2')} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="addr_city">Ciudad</Label>
                <Input id="addr_city" {...register('addr_city')} />
                {errors.addr_city && (
                  <p className="text-xs text-destructive">
                    {errors.addr_city.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr_region">Región</Label>
                <Input id="addr_region" {...register('addr_region')} />
                {errors.addr_region && (
                  <p className="text-xs text-destructive">
                    {errors.addr_region.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr_postalCode">Código postal</Label>
                <Input
                  id="addr_postalCode"
                  {...register('addr_postalCode')}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Documento</h2>
            <div className="space-y-2">
              <Label htmlFor="documentType">Tipo de documento</Label>
              <Select id="documentType" {...register('documentType')}>
                <option value="NONE">Sin documento</option>
                <option value="BOLETA">Boleta</option>
                <option value="FACTURA">Factura</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                rows={3}
                placeholder="Ej: dejar en portería"
              />
            </div>
          </section>

          {/* Selector de método de pago. Solo se muestra si hay 2+ opciones;
              con 1 sola se oculta (no hay nada que elegir) — se envía esa. */}
          {paymentMethods && paymentMethods.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Método de pago</h2>
              {paymentMethods.length === 1 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="font-medium">{paymentMethods[0].name}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentMethods[0].description}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paymentMethods.map((method) => {
                    const checked = selectedMethod === method.id;
                    return (
                      <label
                        key={method.id}
                        className={cn(
                          'flex gap-3 border rounded-lg p-4 cursor-pointer transition-colors',
                          checked
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent/40',
                        )}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method.id}
                          checked={checked}
                          onChange={() => setSelectedMethod(method.id)}
                          className="mt-1 size-4"
                        />
                        <div className="min-w-0">
                          <div className="font-medium">{method.name}</div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {method.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {paymentMethods && paymentMethods.length === 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                No hay métodos de pago disponibles. Contactá al vendedor.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <aside>
          <div className="border rounded-lg p-5 space-y-4 sticky top-20">
            <h2 className="font-semibold">Resumen del pedido</h2>
            <div className="space-y-2 text-sm">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    {item.variant.product.name}
                    <span className="ml-1">× {item.quantity}</span>
                  </span>
                  <span className="font-medium shrink-0">
                    {formatCLP(item.variant.priceGross * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCLP(cart.totals.subtotalGross)}</span>
              </div>
              {cart.totals.discountAmount > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Descuento</span>
                  <span>-{formatCLP(cart.totals.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span className="text-xs">Se calcula al confirmar</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
                <span>Total (sin envío)</span>
                <span>{formatCLP(cart.totals.total)}</span>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={
                loading ||
                (paymentMethods !== null && paymentMethods.length === 0) ||
                (paymentMethods !== null &&
                  paymentMethods.length > 0 &&
                  !selectedMethod)
              }
            >
              {loading && <Loader2 className="animate-spin" />}
              Confirmar orden
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}

/**
 * Redirige al usuario a una pasarela externa (Webpay, etc.) haciendo
 * auto-submit de un form con los params requeridos. El form se inicia
 * oculto y se dispara apenas se monta el componente.
 */
function GatewayRedirect({
  redirect,
}: {
  redirect: {
    url: string;
    method: 'POST' | 'GET';
    params: Record<string, string>;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Un tick para que el form ya esté en el DOM.
    const t = setTimeout(() => formRef.current?.submit(), 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="container mx-auto px-4 py-24 max-w-md text-center">
      <Loader2 className="animate-spin mx-auto mb-4 size-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold mb-2">Redirigiendo al pago…</h1>
      <p className="text-sm text-muted-foreground">
        Te estamos llevando a la pasarela de pago. Si no sucede
        automáticamente, tocá el botón.
      </p>
      <form ref={formRef} action={redirect.url} method={redirect.method}>
        {Object.entries(redirect.params).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button
          type="submit"
          className="mt-4 inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Ir a pagar
        </button>
      </form>
    </div>
  );
}
