'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
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
import { apiGet } from '@/lib/api';
import { formatCLP, formatDate } from '@/lib/utils';

type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'REFUNDED';

interface Address {
  firstName: string;
  lastName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string | null;
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
  paymentStatus: string;
  documentType: 'NONE' | 'BOLETA' | 'FACTURA';
  documentFolio: string | null;
  documentNumber: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  rut: string | null;
  subtotalGross: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  couponCode: string | null;
  shippingAddress: Address | null;
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

export default function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Order>(`/orders/${orderId}`)
      .then(setOrder)
      .catch((err) => setError((err as Error).message));
  }, [orderId]);

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

  return (
    <div className="space-y-6">
      <Link
        href="/cuenta"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver a mis órdenes
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight font-mono">
            {order.orderNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[order.status]}>
            {statusLabels[order.status]}
          </Badge>
          <Badge variant="secondary">Pago: {order.paymentStatus}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.productName}</div>
                    {i.variantName && (
                      <div className="text-xs text-muted-foreground">
                        {i.variantName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCLP(i.priceGross)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCLP(i.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
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
            <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
              <span>Total</span>
              <span>{formatCLP(order.total)}</span>
            </div>
          </CardContent>
        </Card>

        {order.shippingAddress && (
          <Card>
            <CardHeader>
              <CardTitle>Envío</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                {order.shippingAddress.firstName}{' '}
                {order.shippingAddress.lastName}
              </div>
              {order.shippingAddress.phone && (
                <div className="text-muted-foreground">
                  {order.shippingAddress.phone}
                </div>
              )}
              <div className="text-muted-foreground">
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 &&
                  `, ${order.shippingAddress.line2}`}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.region}
                {order.shippingAddress.postalCode &&
                  ` · ${order.shippingAddress.postalCode}`}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {order.documentType !== 'NONE' && order.documentFolio && (
        <Card>
          <CardHeader>
            <CardTitle>Documento</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Tipo:</span>{' '}
              {order.documentType}
            </div>
            <div>
              <span className="text-muted-foreground">Folio:</span>{' '}
              <span className="font-mono">{order.documentFolio}</span>
            </div>
            {order.documentNumber && (
              <div>
                <span className="text-muted-foreground">N°:</span>{' '}
                <span className="font-mono">{order.documentNumber}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
