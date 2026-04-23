'use client';

import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api, apiDelete, apiGet } from '@/lib/api';
import { formatCLP } from '@/lib/utils';

interface Rate {
  id: string | null;
  region: string;
  rate: number | null;
  freeThreshold: number | null;
  etaDays: number | null;
  active: boolean;
}

export default function ShippingRatesPage() {
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    rate: string;
    freeThreshold: string;
    etaDays: string;
    active: boolean;
  }>({ rate: '', freeThreshold: '', etaDays: '', active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<Rate[]>('/admin/shipping-rates');
      setRates(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(r: Rate) {
    setEditing(r.region);
    setDraft({
      rate: r.rate !== null ? String(r.rate) : '',
      freeThreshold: r.freeThreshold !== null ? String(r.freeThreshold) : '',
      etaDays: r.etaDays !== null ? String(r.etaDays) : '',
      active: r.active,
    });
    setError(null);
    setNotice(null);
  }

  async function save(region: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const rate = Number(draft.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error('Rate inválido');
      }
      const freeThreshold =
        draft.freeThreshold.trim() === '' ? null : Number(draft.freeThreshold);
      const etaDays = draft.etaDays.trim() === '' ? null : Number(draft.etaDays);
      await api('/admin/shipping-rates', {
        method: 'PUT',
        body: {
          region,
          rate,
          freeThreshold,
          etaDays,
          active: draft.active,
        },
      });
      setEditing(null);
      setNotice(`"${region}" actualizado`);
      setTimeout(() => setNotice(null), 2500);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(region: string) {
    if (!window.confirm(`¿Eliminar configuración de "${region}"? Pasará a usar tarifa plana default.`)) return;
    try {
      await apiDelete(`/admin/shipping-rates/${encodeURIComponent(region)}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (rates === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Envíos por región
        </h1>
        <p className="text-sm text-muted-foreground">
          Tarifas de envío por región de Chile. Si una región no está configurada,
          se usa la tarifa plana global de <code>store.shipping_flat_rate</code>.
          Todo en CLP, IVA incluido.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>16 regiones de Chile</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Región</TableHead>
                <TableHead className="text-right">Tarifa</TableHead>
                <TableHead className="text-right">Envío gratis desde</TableHead>
                <TableHead className="text-right">ETA (días)</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.region}>
                  <TableCell className="font-medium">{r.region}</TableCell>
                  {editing === r.region ? (
                    <>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={draft.rate}
                          onChange={(e) =>
                            setDraft({ ...draft, rate: e.target.value })
                          }
                          className="w-28 text-right ml-auto"
                          placeholder="CLP"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={draft.freeThreshold}
                          onChange={(e) =>
                            setDraft({ ...draft, freeThreshold: e.target.value })
                          }
                          className="w-32 text-right ml-auto"
                          placeholder="opcional"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={draft.etaDays}
                          onChange={(e) =>
                            setDraft({ ...draft, etaDays: e.target.value })
                          }
                          className="w-20 text-right ml-auto"
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell>
                        <Label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={draft.active}
                            onChange={(e) =>
                              setDraft({ ...draft, active: e.target.checked })
                            }
                          />
                          Activa
                        </Label>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => save(r.region)}
                          disabled={saving}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right font-medium">
                        {r.rate !== null ? formatCLP(r.rate) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.freeThreshold !== null ? formatCLP(r.freeThreshold) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.etaDays ?? '—'}
                      </TableCell>
                      <TableCell>
                        {r.id === null ? (
                          <span className="text-xs text-muted-foreground">
                            No configurada
                          </span>
                        ) : (
                          <span
                            className={
                              r.active
                                ? 'text-xs rounded bg-primary/10 text-primary px-2 py-0.5'
                                : 'text-xs rounded bg-muted px-2 py-0.5'
                            }
                          >
                            {r.active ? 'Activa' : 'Inactiva'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(r)}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {r.id !== null && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(r.region)}
                            title="Eliminar (vuelve a tarifa plana)"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
