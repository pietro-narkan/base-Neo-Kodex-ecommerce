'use client';

import {
  AlertTriangle,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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

type OrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';

interface Stats {
  sales: {
    today: { count: number; amount: number };
    last7d: { count: number; amount: number };
    last30d: { count: number; amount: number };
  };
  pending: { payment: number; fulfillment: number };
  newCustomers30d: number;
  lowStock: Array<{
    variantId: string;
    sku: string;
    productName: string;
    productSlug: string;
    stock: number;
  }>;
  topProducts: Array<{
    sku: string;
    name: string;
    unitsSold: number;
    revenue: number;
  }>;
  latestOrders: Array<{
    id: string;
    orderNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    total: number;
    status: OrderStatus;
    paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
    createdAt: string;
  }>;
}

const statusVariant: Record<OrderStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  PAID: 'success',
  FULFILLED: 'default',
  CANCELLED: 'secondary',
  REFUNDED: 'destructive',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<Stats>('/admin/stats');
        setStats(res);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Estado actual de la tienda.
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive">
          No se pudieron cargar los datos: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ventas hoy"
          value={stats ? formatCLP(stats.sales.today.amount) : undefined}
          subtitle={stats ? `${stats.sales.today.count} pagadas` : undefined}
          icon={TrendingUp}
        />
        <StatCard
          label="Ventas 7 días"
          value={stats ? formatCLP(stats.sales.last7d.amount) : undefined}
          subtitle={stats ? `${stats.sales.last7d.count} pagadas` : undefined}
          icon={TrendingUp}
        />
        <StatCard
          label="Ventas 30 días"
          value={stats ? formatCLP(stats.sales.last30d.amount) : undefined}
          subtitle={stats ? `${stats.sales.last30d.count} pagadas` : undefined}
          icon={TrendingUp}
        />
        <StatCard
          label="Nuevos clientes (30d)"
          value={stats?.newCustomers30d}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Pendientes de pago</span>
              <ShoppingCart className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <>
                <p className="text-3xl font-bold">{stats.pending.payment}</p>
                {stats.pending.payment > 0 && (
                  <Link
                    href="/orders?status=PENDING"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Ver órdenes →
                  </Link>
                )}
              </>
            ) : (
              <Skeleton className="h-8 w-12" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Pendientes de envío</span>
              <Package className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <p className="text-3xl font-bold">{stats.pending.fulfillment}</p>
            ) : (
              <Skeleton className="h-8 w-12" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Stock bajo</span>
              <AlertTriangle className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <p className="text-3xl font-bold">{stats.lowStock.length}</p>
            ) : (
              <Skeleton className="h-8 w-12" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top productos (30 días)</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <Skeleton className="h-32 w-full" />
            ) : stats.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Sin ventas en los últimos 30 días.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Unidades</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topProducts.map((p) => (
                    <TableRow key={p.sku}>
                      <TableCell className="truncate max-w-xs">{p.name}</TableCell>
                      <TableCell>{p.unitsSold}</TableCell>
                      <TableCell className="font-medium">
                        {formatCLP(p.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock bajo (&lt; 5)</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <Skeleton className="h-32 w-full" />
            ) : stats.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Todo en orden — sin productos con stock bajo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.lowStock.map((v) => (
                    <TableRow key={v.variantId}>
                      <TableCell className="truncate max-w-xs">
                        {v.productName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                      <TableCell>
                        <Badge variant={v.stock === 0 ? 'destructive' : 'warning'}>
                          {v.stock}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas órdenes</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <Skeleton className="h-32 w-full" />
          ) : stats.latestOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sin órdenes aún.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.latestOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/orders/${o.id}`}
                        className="font-mono hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {o.firstName} {o.lastName}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCLP(o.total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[o.status]}>{o.status}</Badge>
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

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: string | number | undefined;
  subtitle?: string;
  icon: typeof Package;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
