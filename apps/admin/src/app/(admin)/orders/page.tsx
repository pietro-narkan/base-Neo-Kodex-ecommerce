'use client';

import { Download, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { API_URL, apiGet } from '@/lib/api';
import { formatCLP, formatDate } from '@/lib/utils';

type OrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
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

function buildQuery(
  filter: '' | OrderStatus,
  q: string,
  from: string,
  to: string,
  limit: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (filter) params.set('status', filter);
  if (q.trim()) params.set('q', q.trim());
  if (from) params.set('from', new Date(from).toISOString());
  if (to) params.set('to', new Date(to).toISOString());
  return params;
}

export default function OrdersListPage() {
  const [data, setData] = useState<Order[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'' | OrderStatus>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const params = buildQuery(filter, q, from, to, 100);
      const res = await apiGet<{ data: Order[]; total: number }>(
        `/admin/orders?${params.toString()}`,
      );
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter, q, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const params = buildQuery(filter, q, from, to, 5000);
      const token = localStorage.getItem('nk_token') ?? '';
      const res = await fetch(
        `${API_URL}/admin/orders/export?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`Export falló: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Órdenes</h1>
          <p className="text-sm text-muted-foreground">
            {total} pedido{total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Exportar CSV
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 grid grid-cols-1 md:grid-cols-[1fr_180px_180px_180px] gap-3">
        <div className="space-y-1">
          <Label htmlFor="q">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="q"
              placeholder="Número, email, nombre…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter">Estado</Label>
          <Select
            id="filter"
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
        <div className="space-y-1">
          <Label htmlFor="from">Desde</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Hasta</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
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
          No hay órdenes que coincidan con los filtros.
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
                <TableRow key={o.id}>
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
                    <div className="text-xs text-muted-foreground">{o.email}</div>
                  </TableCell>
                  <TableCell className="font-medium">{formatCLP(o.total)}</TableCell>
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
