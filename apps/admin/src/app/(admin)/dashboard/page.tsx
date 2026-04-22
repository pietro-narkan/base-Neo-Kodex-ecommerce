'use client';

import { Package, ShoppingCart, Tag, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiGet } from '@/lib/api';

interface Paginated<T> {
  data: T[];
  total: number;
}

interface Stats {
  products: number;
  orders: number;
  pendingOrders: number;
  categories: number;
  coupons: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [products, orders, pending, categories, coupons] =
          await Promise.all([
            apiGet<Paginated<unknown>>('/admin/products?limit=1'),
            apiGet<Paginated<unknown>>('/admin/orders?limit=1'),
            apiGet<Paginated<unknown>>('/admin/orders?limit=1&status=PENDING'),
            apiGet<Paginated<unknown>>('/admin/categories?limit=1'),
            apiGet<Paginated<unknown>>('/admin/coupons?limit=1'),
          ]);
        setStats({
          products: products.total,
          orders: orders.total,
          pendingOrders: pending.total,
          categories: categories.total,
          coupons: coupons.total,
        });
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  const cards: Array<{
    label: string;
    value: number | undefined;
    icon: typeof Package;
  }> = [
    { label: 'Órdenes totales', value: stats?.orders, icon: ShoppingCart },
    {
      label: 'Órdenes pendientes',
      value: stats?.pendingOrders,
      icon: ShoppingCart,
    },
    { label: 'Productos', value: stats?.products, icon: Package },
    { label: 'Categorías', value: stats?.categories, icon: Tag },
    { label: 'Cupones', value: stats?.coupons, icon: Ticket },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen del estado de la tienda.
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive">
          No se pudieron cargar los datos: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {c.value === undefined ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{c.value}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
