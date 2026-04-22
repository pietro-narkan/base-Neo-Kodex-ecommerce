'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiGet, apiPatch } from '@/lib/api';
import { cn, formatCLP, formatDate } from '@/lib/utils';

type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'REFUNDED';
type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
type DocumentType = 'NONE' | 'BOLETA' | 'FACTURA';

interface Address {
  firstName: string;
  lastName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  country: string;
}

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  priceGross: number;
  subtotal: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  documentType: DocumentType;
  documentFolio: string | null;
  documentNumber: string | null;

  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  rut: string | null;

  subtotalNet: number;
  subtotalGross: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  couponCode: string | null;

  paymentProvider: string | null;
  paymentReference: string | null;
  shippingProvider: string | null;
  trackingNumber: string | null;

  shippingAddress: Address | null;
  billingAddress: Address | null;

  items: OrderItem[];
  notes: string | null;
  createdAt: string;
}

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  FULFILLED: 'Despachada',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

const statusVariant: Record<OrderStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  PAID: 'success',
  FULFILLED: 'default',
  CANCELLED: 'secondary',
  REFUNDED: 'destructive',
};

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLED', 'REFUNDED', 'CANCELLED'],
  FULFILLED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

function AddressBlock({ title, address }: { title: string; address: Address }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {title}
      </div>
      <div className="text-sm">
        {address.firstName} {address.lastName}
        {address.phone && <> · {address.phone}</>}
      </div>
      <div className="text-sm text-muted-foreground">
        {address.line1}
        {address.line2 && <>, {address.line2}</>}
        <br />
        {address.city}, {address.region}
        {address.postalCode && <> · {address.postalCode}</>}
      </div>
    </div>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(() => {
    apiGet<Order>(`/admin/orders/${id}`)
      .then(setOrder)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChangeStatus(next: OrderStatus) {
    const label = statusLabels[next].toLowerCase();
    if (!window.confirm(`¿Marcar orden como ${label}?`)) return;
    setUpdating(true);
    try {
      await apiPatch(`/admin/orders/${id}/status`, { status: next });
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allowed = transitions[order.status];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver a órdenes
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {order.orderNumber}
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={statusVariant[order.status]}>
              {statusLabels[order.status]}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              Pago: {order.paymentStatus}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {formatDate(order.createdAt)}
            </span>
          </div>
        </div>
        {allowed.length > 0 && (
          <div className="flex gap-2">
            {allowed.map((s) => (
              <Button
                key={s}
                variant={s === 'CANCELLED' || s === 'REFUNDED' ? 'destructive' : 'default'}
                size="sm"
                disabled={updating}
                onClick={() => handleChangeStatus(s)}
              >
                {updating && <Loader2 className="animate-spin" />}
                Marcar como {statusLabels[s].toLowerCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.productName}</div>
                      {item.variantName && (
                        <div className="text-xs text-muted-foreground">
                          {item.variantName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.sku}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCLP(item.priceGross)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCLP(item.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal neto</span>
              <span>{formatCLP(order.subtotalNet)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>IVA</span>
              <span>{formatCLP(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal (con IVA)</span>
              <span>{formatCLP(order.subtotalGross)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>
                  Descuento
                  {order.couponCode && (
                    <span className="font-mono text-xs ml-1">
                      ({order.couponCode})
                    </span>
                  )}
                </span>
                <span>-{formatCLP(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Envío</span>
              <span>{formatCLP(order.shippingAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t pt-2 mt-2">
              <span>Total</span>
              <span>{formatCLP(order.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Nombre:</span>{' '}
              {order.firstName} {order.lastName}
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{' '}
              {order.email}
            </div>
            {order.phone && (
              <div>
                <span className="text-muted-foreground">Teléfono:</span>{' '}
                {order.phone}
              </div>
            )}
            {order.rut && (
              <div>
                <span className="text-muted-foreground">RUT:</span> {order.rut}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Direcciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.shippingAddress && (
              <AddressBlock title="Envío" address={order.shippingAddress} />
            )}
            {order.billingAddress &&
              order.billingAddress !== order.shippingAddress && (
                <AddressBlock
                  title="Facturación"
                  address={order.billingAddress}
                />
              )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pago y envío</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Proveedor pago:</span>{' '}
              {order.paymentProvider ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Referencia:</span>{' '}
              <span className="font-mono text-xs">
                {order.paymentReference ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Proveedor envío:</span>{' '}
              {order.shippingProvider ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Tracking:</span>{' '}
              {order.trackingNumber ?? '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DTE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Tipo:</span>{' '}
              {order.documentType === 'NONE' ? '—' : order.documentType}
            </div>
            {order.documentFolio && (
              <div>
                <span className="text-muted-foreground">Folio:</span>{' '}
                <span className="font-mono text-xs">
                  {order.documentFolio}
                </span>
              </div>
            )}
            {order.documentNumber && (
              <div>
                <span className="text-muted-foreground">N°:</span>{' '}
                <span className="font-mono text-xs">
                  {order.documentNumber}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
