'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiGet } from '@/lib/api';
import { cn, formatCLP, formatDate } from '@/lib/utils';

type OrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';

interface Address {
  id: string;
  firstName: string;
  lastName: string;
  line1: string;
  city: string;
  region: string;
  country: string;
  isDefault: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  total: number;
  items: Array<{ id: string; productName: string; quantity: number; subtotal: number }>;
  createdAt: string;
}

interface CustomerDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  rut: string | null;
  isGuest: boolean;
  ordersCount: number;
  lifetimeValue: number;
  createdAt: string;
  addresses: Address[];
  orders: Order[];
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

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!params?.id) return;
    try {
      const res = await apiGet<CustomerDetail>(`/admin/customers/${params.id}`);
      setCustomer(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return <div className="text-destructive text-sm">{error}</div>;
  }
  if (!customer) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/customers"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {[customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
              customer.email}
          </h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="text-lg font-medium">
              {customer.isGuest ? 'Guest' : 'Registrado'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Órdenes</p>
            <p className="text-2xl font-semibold">{customer.ordersCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Lifetime Value</p>
            <p className="text-2xl font-semibold text-emerald-600">
              {formatCLP(customer.lifetimeValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cliente desde</p>
            <p className="text-sm">{formatDate(customer.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de contacto</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Teléfono</p>
            <p>{customer.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">RUT</p>
            <p>{customer.rut ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ID</p>
            <p className="font-mono text-xs">{customer.id}</p>
          </div>
        </CardContent>
      </Card>

      {customer.addresses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Direcciones ({customer.addresses.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customer.addresses.map((a) => (
              <div key={a.id} className="text-sm border rounded-md p-3">
                <p className="font-medium">
                  {a.firstName} {a.lastName}
                  {a.isDefault && (
                    <span className="ml-2 text-xs rounded bg-primary/10 text-primary px-2 py-0.5">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {a.line1}, {a.city}, {a.region}, {a.country}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de compras ({customer.orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No hay órdenes todavía.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/orders/${o.id}`} className="font-mono hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                      {o.items.map((i) => `${i.quantity}× ${i.productName}`).join(' · ')}
                    </TableCell>
                    <TableCell className="font-medium">{formatCLP(o.total)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[o.status]}>
                        {statusLabels[o.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
