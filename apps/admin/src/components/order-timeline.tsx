'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiDelete, apiGet, apiPost } from '@/lib/api';

interface TimelineEntry {
  id: string;
  kind: 'audit' | 'note';
  action: string;
  actorName: string;
  createdAt: string;
  note?: {
    content: string;
    isPublic: boolean;
    authorType: string;
  };
  details?: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    login: 'Login',
    'login.failed': 'Intento de login fallido',
    create: 'Creado',
    update: 'Actualizado',
    delete: 'Eliminado',
    'update.item.quantity': 'Cantidad de item cambiada',
    'remove.item': 'Item eliminado',
    'update.shippingAddress': 'Dirección de envío actualizada',
    'update.billingAddress': 'Dirección de facturación actualizada',
    'note.create.public': 'Nota pública agregada',
    'note.create.internal': 'Nota interna agregada',
    'note.delete': 'Nota eliminada',
    'note.public': 'Nota pública',
    'note.internal': 'Nota interna',
    'password.reset.requested': 'Password reset solicitado',
    'password.reset.confirmed': 'Password reset confirmado',
  };
  return map[action] ?? action;
}

function actionTone(entry: TimelineEntry): string {
  if (entry.kind === 'note') {
    return entry.note?.isPublic ? 'border-l-emerald-500' : 'border-l-amber-500';
  }
  if (entry.action.startsWith('delete') || entry.action.startsWith('remove')) {
    return 'border-l-destructive';
  }
  if (entry.action.startsWith('create')) return 'border-l-blue-500';
  return 'border-l-muted-foreground/30';
}

export function OrderTimeline({ orderId }: { orderId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-note form
  const [noteContent, setNoteContent] = useState('');
  const [noteIsPublic, setNoteIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<TimelineEntry[]>(`/admin/orders/${orderId}/timeline`);
      setEntries(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/admin/orders/${orderId}/notes`, {
        content: noteContent.trim(),
        isPublic: noteIsPublic,
      });
      setNoteContent('');
      setNoteIsPublic(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(entryId: string) {
    // entry.id format: "note:<id>"
    const noteId = entryId.replace(/^note:/, '');
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try {
      await apiDelete(`/admin/orders/${orderId}/notes/${noteId}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad y notas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={addNote} className="space-y-2 border rounded-md p-3 bg-muted/20">
          <Label htmlFor="note">Agregar nota</Label>
          <Textarea
            id="note"
            rows={2}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Ej: cliente pidió cambiar a retiro en tienda"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="size-4"
                checked={noteIsPublic}
                onChange={(e) => setNoteIsPublic(e.target.checked)}
              />
              Pública (visible al cliente en el futuro). Si está apagada, solo la ves vos.
            </label>
            <Button type="submit" size="sm" disabled={saving || !noteContent.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Agregar
            </Button>
          </div>
        </form>

        {entries === null ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay actividad registrada todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.id}
                className={`border-l-2 pl-3 py-1.5 ${actionTone(e)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{actionLabel(e.action)}</span>
                      <span className="text-muted-foreground"> · {e.actorName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.createdAt)}
                    </p>
                    {e.note && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {e.note.content}
                        {!e.note.isPublic && (
                          <span className="ml-2 text-xs rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">
                            interna
                          </span>
                        )}
                      </p>
                    )}
                    {e.details && (e.details.before || e.details.after) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Ver detalles
                        </summary>
                        <pre className="text-xs bg-muted/40 p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  {e.kind === 'note' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteNote(e.id)}
                      aria-label="Eliminar nota"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
