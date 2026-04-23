'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiGet } from '@/lib/api';

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ENTITY_TYPES = [
  '',
  'admin',
  'product',
  'variant',
  'category',
  'order',
  'customer',
  'setting',
  'coupon',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

function actionTone(action: string): string {
  if (action.startsWith('login.failed')) return 'text-destructive';
  if (action.startsWith('delete')) return 'text-destructive';
  if (action.startsWith('login')) return 'text-blue-600';
  if (action.startsWith('password')) return 'text-amber-600';
  if (action.startsWith('create')) return 'text-emerald-600';
  return 'text-muted-foreground';
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (entityType) params.set('entityType', entityType);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());
      const res = await apiGet<AuditEntry[]>(`/admin/audit-log?${params.toString()}`);
      setEntries(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [entityType, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registro de actividad</h1>
        <p className="text-sm text-muted-foreground">
          Historial de acciones de admins. Solo ADMIN puede ver este log.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Filtros</span>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="size-4" />
              Refrescar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="entityType">Tipo de entidad</Label>
              <Select
                id="entityType"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t || 'Todas'}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="from">Desde</Label>
              <Input
                id="from"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Hasta</Label>
              <Input
                id="to"
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entradas ({entries?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {entries === null ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No hay entradas en el rango seleccionado.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="border rounded-md p-3 text-sm grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2"
                >
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatDate(e.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.actorEmail}
                    </p>
                  </div>
                  <div>
                    <p>
                      <span className={`font-medium ${actionTone(e.action)}`}>
                        {e.action}
                      </span>{' '}
                      <span className="text-muted-foreground">{e.entityType}</span>
                      {e.entityId && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {' '}
                          · {e.entityId}
                        </span>
                      )}
                    </p>
                    {(e.before || e.after || e.metadata) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Ver detalles
                        </summary>
                        <pre className="mt-2 text-xs bg-muted/50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(
                            {
                              before: e.before,
                              after: e.after,
                              metadata: e.metadata,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
