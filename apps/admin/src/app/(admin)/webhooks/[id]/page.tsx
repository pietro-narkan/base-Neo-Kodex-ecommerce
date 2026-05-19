'use client';

import { Loader2, RotateCw, Send } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { SecretRevealModal } from '@/components/webhooks/secret-reveal-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

const EVENT_OPTIONS = [
  'order.created',
  'order.paid',
  'order.fulfilled',
  'order.cancelled',
  'order.refunded',
] as const;

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
}

interface Delivery {
  id: string;
  event: string;
  statusCode: number | null;
  attemptCount: number;
  deliveredAt: string | null;
  failedAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

function deliveryStatus(d: Delivery): { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' } {
  if (d.deliveredAt) return { label: 'Entregado', variant: 'success' };
  if (d.failedAt) return { label: 'Falló', variant: 'destructive' };
  if (d.nextAttemptAt) return { label: 'Reintentando', variant: 'warning' };
  return { label: 'Pendiente', variant: 'secondary' };
}

export default function WebhookDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, d] = await Promise.all([
        apiGet<Webhook>(`/admin/webhooks/${params.id}`),
        apiGet<{ data: Delivery[] }>(
          `/admin/webhooks/${params.id}/deliveries?limit=100`,
        ),
      ]);
      setWebhook(w);
      setDeliveries(d.data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!webhook) return;
    setSaving(true);
    try {
      await apiPatch(`/admin/webhooks/${webhook.id}`, {
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
      });
      router.push('/webhooks');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function rotateSecret() {
    if (!webhook) return;
    if (!window.confirm('¿Rotar el secret? El secret anterior dejará de funcionar.')) return;
    try {
      const res = await apiPost<{ secret: string }>(
        `/admin/webhooks/${webhook.id}/rotate-secret`,
      );
      setNewSecret(res.secret);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function sendTest() {
    if (!webhook) return;
    try {
      await apiPost(`/admin/webhooks/${webhook.id}/test`);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function toggleEvent(event: (typeof EVENT_OPTIONS)[number]) {
    if (!webhook) return;
    const next = webhook.events.includes(event)
      ? webhook.events.filter((e) => e !== event)
      : [...webhook.events, event];
    setWebhook({ ...webhook, events: next });
  }

  if (!webhook) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Editar webhook</h1>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            value={webhook.name}
            onChange={(e) => setWebhook({ ...webhook, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="url">URL</Label>
          <Input
            id="url"
            type="url"
            value={webhook.url}
            onChange={(e) => setWebhook({ ...webhook, url: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Eventos</Label>
          {EVENT_OPTIONS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={webhook.events.includes(event)}
                onChange={() => toggleEvent(event)}
              />
              <code>{event}</code>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={webhook.active}
            onChange={(e) => setWebhook({ ...webhook, active: e.target.checked })}
          />
          <span>Activo</span>
        </label>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
          <Button onClick={rotateSecret} variant="outline">
            <RotateCw className="size-4" />
            Rotar secret
          </Button>
          <Button onClick={sendTest} variant="outline">
            <Send className="size-4" />
            Enviar test
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Últimas entregas</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin deliveries todavía.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Intentos</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Entregado / Falló</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => {
                  const s = deliveryStatus(d);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.event}</TableCell>
                      <TableCell>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.statusCode ?? '—'}
                      </TableCell>
                      <TableCell>{d.attemptCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.deliveredAt
                          ? new Date(d.deliveredAt).toLocaleString()
                          : d.failedAt
                            ? new Date(d.failedAt).toLocaleString()
                            : d.nextAttemptAt
                              ? `Reintento ${new Date(d.nextAttemptAt).toLocaleString()}`
                              : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <SecretRevealModal
        open={newSecret !== null}
        secret={newSecret ?? ''}
        onClose={() => setNewSecret(null)}
      />
    </div>
  );
}
