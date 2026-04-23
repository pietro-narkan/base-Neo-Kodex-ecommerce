'use client';

import { Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

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
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Customer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  rut: string | null;
  isGuest: boolean;
  ordersCount: number;
  createdAt: string;
}

interface Response {
  data: Customer[];
  total: number;
}

export default function CustomersListPage() {
  const [data, setData] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'' | 'guests' | 'registered'>('');

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (q.trim()) params.set('q', q.trim());
      if (filter === 'guests') params.set('isGuest', 'true');
      if (filter === 'registered') params.set('isGuest', 'false');
      const res = await apiGet<Response>(`/admin/customers?${params.toString()}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [q, filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          {total} cliente{total === 1 ? '' : 's'}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">
        <div className="space-y-1">
          <Label htmlFor="q">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="q"
              placeholder="Email, nombre, teléfono, RUT…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter">Tipo</Label>
          <Select
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as '' | 'guests' | 'registered')}
          >
            <option value="">Todos</option>
            <option value="registered">Registrados</option>
            <option value="guests">Guest (solo compró)</option>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No hay clientes que coincidan.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Órdenes</TableHead>
                <TableHead>Registrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {c.email}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                  <TableCell>
                    <span
                      className={
                        c.isGuest
                          ? 'text-xs rounded bg-muted px-2 py-0.5'
                          : 'text-xs rounded bg-primary/10 text-primary px-2 py-0.5'
                      }
                    >
                      {c.isGuest ? 'Guest' : 'Registrado'}
                    </span>
                  </TableCell>
                  <TableCell>{c.ordersCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(c.createdAt)}
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
