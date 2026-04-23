'use client';

import {
  Check,
  EyeOff,
  Loader2,
  MessageSquare,
  Save,
  Star,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

type ReviewStatus = 'PENDING' | 'APPROVED' | 'HIDDEN';

interface AdminReview {
  id: string;
  productId: string;
  productName?: string;
  email: string;
  firstName: string;
  rating: number | null;
  title: string | null;
  comment: string;
  adminReply: string | null;
  adminReplyAt: string | null;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

interface ReviewsSettings {
  enabled: boolean;
  starsEnabled: boolean;
  starsRequired: boolean;
}

interface ListResponse {
  items: AdminReview[];
  total: number;
  page: number;
  limit: number;
}

type StatusFilter = 'ALL' | ReviewStatus;

const STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  HIDDEN: 'Oculta',
};

const STATUS_BADGE: Record<
  ReviewStatus,
  'default' | 'success' | 'warning' | 'secondary'
> = {
  PENDING: 'warning',
  APPROVED: 'success',
  HIDDEN: 'secondary',
};

export default function ReviewsPage() {
  const [settings, setSettings] = useState<ReviewsSettings | null>(null);
  const [draft, setDraft] = useState<ReviewsSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [list, setList] = useState<ListResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiGet<ReviewsSettings>('/admin/reviews/settings');
      setSettings(res);
      setDraft(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const query =
        filter === 'ALL' ? '' : `?status=${encodeURIComponent(filter)}`;
      const res = await apiGet<ListResponse>(`/admin/reviews${query}`);
      setList(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const settingsDirty = useMemo(() => {
    if (!settings || !draft) return false;
    return (
      settings.enabled !== draft.enabled ||
      settings.starsEnabled !== draft.starsEnabled ||
      settings.starsRequired !== draft.starsRequired
    );
  }, [settings, draft]);

  async function saveSettings() {
    if (!draft) return;
    setSavingSettings(true);
    setError(null);
    setNotice(null);
    try {
      await api('/admin/reviews/settings', {
        method: 'PUT',
        body: draft,
      });
      setNotice('Configuración guardada.');
      setTimeout(() => setNotice(null), 2500);
      await loadSettings();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function moderate(id: string, status: ReviewStatus) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api(`/admin/reviews/${id}/moderate`, {
        method: 'POST',
        body: { status },
      });
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar definitivamente esta valoración?')) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api(`/admin/reviews/${id}`, { method: 'DELETE' });
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/reviews/${id}/reply`, {
        reply: replyDraft.trim() ? replyDraft : null,
      });
      setReplyOpenFor(null);
      setReplyDraft('');
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Valoraciones</h1>
        <p className="text-sm text-muted-foreground">
          Configuración del sistema de reseñas y moderación de las
          valoraciones que dejan los clientes.
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

      {/* Configuración */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft ? (
            <>
              <CheckboxRow
                checked={draft.enabled}
                onChange={(v) => setDraft({ ...draft, enabled: v })}
                label="Activar valoraciones"
                hint="Si está apagado, el formulario no aparece en la ficha del producto y la API rechaza nuevas reseñas."
              />
              <CheckboxRow
                checked={draft.starsEnabled}
                onChange={(v) => setDraft({ ...draft, starsEnabled: v })}
                label="Activar puntuaciones con estrellas en las valoraciones"
                hint="Si está apagado, las reseñas son solo texto (sin estrellas)."
              />
              <CheckboxRow
                checked={draft.starsRequired}
                onChange={(v) => setDraft({ ...draft, starsRequired: v })}
                disabled={!draft.starsEnabled}
                label="Las puntuaciones con estrellas deberán ser obligatorias, no opcionales"
                hint="Solo aplica cuando las estrellas están activadas."
              />
              <div>
                <Button
                  onClick={saveSettings}
                  disabled={!settingsDirty || savingSettings}
                >
                  {savingSettings ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar configuración
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Listado + moderación */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Moderación</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(['PENDING', 'APPROVED', 'HIDDEN', 'ALL'] as StatusFilter[]).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'text-xs px-3 py-1 rounded-full border transition-colors',
                    filter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent',
                  )}
                >
                  {f === 'ALL' ? 'Todas' : STATUS_LABELS[f]}
                </button>
              ),
            )}
          </div>
        </CardHeader>
        <CardContent>
          {list === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : list.items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No hay valoraciones en este estado.
            </p>
          ) : (
            <div className="space-y-3">
              {list.items.map((r) => (
                <div key={r.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {r.firstName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({r.email})
                        </span>
                        <Badge variant={STATUS_BADGE[r.status]}>
                          {STATUS_LABELS[r.status]}
                        </Badge>
                        {r.isVerifiedPurchase && (
                          <Badge variant="outline">Compra verificada</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Producto:{' '}
                        <span className="font-medium">
                          {r.productName ?? r.productId}
                        </span>
                        {' · '}
                        {new Date(r.createdAt).toLocaleString('es-CL')}
                      </div>
                    </div>
                    {r.rating != null && <Stars value={r.rating} />}
                  </div>

                  {r.title && (
                    <div className="font-medium text-sm">{r.title}</div>
                  )}
                  <p className="text-sm whitespace-pre-line">{r.comment}</p>

                  {r.adminReply && (
                    <div className="rounded-md bg-muted/40 border-l-2 border-primary/60 px-3 py-2 text-sm">
                      <div className="text-xs text-muted-foreground mb-1">
                        Respuesta del admin
                        {r.adminReplyAt &&
                          ` · ${new Date(r.adminReplyAt).toLocaleString('es-CL')}`}
                      </div>
                      <p className="whitespace-pre-line">{r.adminReply}</p>
                    </div>
                  )}

                  {replyOpenFor === r.id && (
                    <div className="space-y-2">
                      <Label htmlFor={`reply-${r.id}`} className="text-xs">
                        Respuesta (pública — se muestra bajo la review)
                      </Label>
                      <Textarea
                        id={`reply-${r.id}`}
                        rows={3}
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder="Dejá vacío para borrar la respuesta existente."
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => sendReply(r.id)}
                          disabled={busyId === r.id}
                        >
                          Guardar respuesta
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyOpenFor(null);
                            setReplyDraft('');
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'APPROVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => moderate(r.id, 'APPROVED')}
                        disabled={busyId === r.id}
                      >
                        <Check className="size-4" />
                        Aprobar
                      </Button>
                    )}
                    {r.status !== 'HIDDEN' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => moderate(r.id, 'HIDDEN')}
                        disabled={busyId === r.id}
                      >
                        <EyeOff className="size-4" />
                        Ocultar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplyOpenFor(
                          replyOpenFor === r.id ? null : r.id,
                        );
                        setReplyDraft(r.adminReply ?? '');
                      }}
                    >
                      <MessageSquare className="size-4" />
                      {r.adminReply ? 'Editar respuesta' : 'Responder'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(r.id)}
                      disabled={busyId === r.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Borrar
                    </Button>
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

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 py-1 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 rounded border-input"
      />
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </label>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'size-4',
            n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted',
          )}
        />
      ))}
    </div>
  );
}
