'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
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

type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

interface Order {
  id: string;
  orderNumber: string;
  email: string;
  firstName: string;
  lastName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
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

const paymentVariant: Record<PaymentStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
};

export default function OrdersListPage() {
  const [data, setData] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'' | OrderStatus>('');

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const q = filter ? `&status=${filter}` : '';
      const res = await apiGet<{ data: Order[] }>(
        `/admin/orders?limit=100${q}`,
      );
      setData(res.data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Órdenes</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos recibidos, ordenados por fecha.
          </p>
        </div>
        <div className="w-56">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as '' | OrderStatus)}
          >
            <option value="">Todas</option>
            <option value="PENDING">Pendientes</option>
            <option value="PAID">Pagadas</option>
            <option value="FULFILLED">Despachadas</option>
            <option value="CANCELLED">Canceladas</option>
            <option value="REFUNDED">Reembolsadas</option>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No hay órdenes{filter ? ' con ese estado' : ''}.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow key={o.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-mono font-medium hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {o.firstName} {o.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.email}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCLP(o.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[o.status]}>
                      {statusLabels[o.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={paymentVariant[o.paymentStatus]}>
                      {o.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
