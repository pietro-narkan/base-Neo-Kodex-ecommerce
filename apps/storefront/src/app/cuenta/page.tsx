'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
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

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
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

export default function AccountOrdersPage() {
  const [data, setData] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Order[] }>('/orders?limit=50')
      .then((r) => setData(r.data))
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Mis órdenes</h2>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {data === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center border rounded-lg">
          Aún no tenés órdenes. <Link href="/productos" className="underline">Explorá el catálogo</Link>.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow key={o.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/cuenta/${o.id}`}
                      className="font-mono font-medium hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCLP(o.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[o.status]}>
                      {statusLabels[o.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.paymentStatus}
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
