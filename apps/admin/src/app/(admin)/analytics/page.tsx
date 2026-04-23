'use client';

import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Save,
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

interface AnalyticsTool {
  id: string;
  label: string;
  description: string;
  docsUrl: string;
  hasBodySnippet: boolean;
  headHint: string;
  bodyHint?: string;
  config: {
    enabled: boolean;
    headHtml: string;
    bodyHtml: string;
  };
}

export default function AnalyticsPage() {
  const [tools, setTools] = useState<AnalyticsTool[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftHead, setDraftHead] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<AnalyticsTool[]>('/admin/analytics');
      setTools(res);
      if (res.length > 0 && !selectedId) {
        setSelectedId(res[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => tools?.find((t) => t.id === selectedId) ?? null,
    [tools, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraftEnabled(selected.config.enabled);
    setDraftHead(selected.config.headHtml);
    setDraftBody(selected.config.bodyHtml);
    setError(null);
    setNotice(null);
  }, [
    selected?.id,
    selected?.config.enabled,
    selected?.config.headHtml,
    selected?.config.bodyHtml,
  ]);

  const isDirty =
    !!selected &&
    (draftEnabled !== selected.config.enabled ||
      draftHead !== selected.config.headHtml ||
      (selected.hasBodySnippet && draftBody !== selected.config.bodyHtml));

  const isConfigured =
    !!selected &&
    (selected.config.headHtml.trim() !== '' ||
      selected.config.bodyHtml.trim() !== '');

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/admin/analytics/${encodeURIComponent(selected.id)}`, {
        method: 'PUT',
        body: {
          enabled: draftEnabled,
          headHtml: draftHead,
          bodyHtml: selected.hasBodySnippet ? draftBody : '',
        },
      });
      setNotice(`"${selected.label}" actualizado.`);
      setTimeout(() => setNotice(null), 2500);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selected) return;
    if (
      !confirm(
        `¿Borrar la configuración de "${selected.label}"? Se pierde el código que tengas pegado.`,
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost(
        `/admin/analytics/${encodeURIComponent(selected.id)}/reset`,
      );
      setNotice('Configuración borrada.');
      setTimeout(() => setNotice(null), 2500);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  if (tools === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analítica</h1>
        <p className="text-sm text-muted-foreground">
          Pegá los snippets de tus herramientas de tracking — se inyectan en el
          storefront público. Solo ADMIN puede modificar.
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

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <aside className="border rounded-lg bg-card overflow-hidden">
          <div className="divide-y">
            {tools.map((t) => {
              const active = t.id === selectedId;
              const on = t.config.enabled;
              const hasCode =
                t.config.headHtml.trim() !== '' ||
                t.config.bodyHtml.trim() !== '';
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 text-sm transition-colors flex items-start gap-2',
                    active
                      ? 'bg-primary/10'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <BarChart3
                    className={cn(
                      'size-4 mt-0.5 shrink-0',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                      <span
                        className={cn(
                          'inline-block size-1.5 rounded-full',
                          on
                            ? 'bg-green-500'
                            : hasCode
                              ? 'bg-amber-500'
                              : 'bg-muted-foreground/40',
                        )}
                      />
                      <span className="text-muted-foreground">
                        {on
                          ? 'Activa'
                          : hasCode
                            ? 'Configurada, pausada'
                            : 'Sin configurar'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-4 min-w-0">
          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      {selected.label}
                      {selected.config.enabled ? (
                        <Badge variant="success">Activa</Badge>
                      ) : isConfigured ? (
                        <Badge variant="warning">Pausada</Badge>
                      ) : (
                        <Badge variant="outline">Sin configurar</Badge>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {selected.description}
                    </p>
                    <a
                      href={selected.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Dónde encontrar el código
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Toggle activada/pausada */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <span
                    role="switch"
                    aria-checked={draftEnabled}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setDraftEnabled((v) => !v);
                      }
                    }}
                    onClick={() => setDraftEnabled((v) => !v)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
                      draftEnabled ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-4 rounded-full bg-background shadow transition-transform',
                        draftEnabled ? 'translate-x-[18px]' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                  <span className="text-sm font-medium">
                    {draftEnabled ? 'Activa' : 'Pausada'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {draftEnabled
                      ? 'Los snippets se inyectan en el storefront público.'
                      : 'Los snippets no se inyectan (la configuración queda guardada).'}
                  </span>
                </label>

                <div className="space-y-1.5">
                  <Label htmlFor="head-html">Snippet para &lt;head&gt;</Label>
                  <Textarea
                    id="head-html"
                    rows={10}
                    value={draftHead}
                    onChange={(e) => setDraftHead(e.target.value)}
                    className="font-mono text-xs"
                    placeholder={'<!-- pegá aquí el <script>...</script> -->'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {selected.headHint}
                  </p>
                </div>

                {selected.hasBodySnippet && (
                  <div className="space-y-1.5">
                    <Label htmlFor="body-html">
                      Snippet para abrir &lt;body&gt; (noscript)
                    </Label>
                    <Textarea
                      id="body-html"
                      rows={5}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      className="font-mono text-xs"
                      placeholder={'<!-- pegá aquí el <noscript>...</noscript> -->'}
                    />
                    <p className="text-xs text-muted-foreground">
                      {selected.bodyHint}
                    </p>
                  </div>
                )}

                <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  <strong>Importante:</strong> el código se inyecta tal cual,
                  sin validación. Pegá solo snippets oficiales de tu proveedor —
                  cualquier script acá corre en el navegador de tus visitantes.
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={handleSave} disabled={!isDirty || saving}>
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Guardar cambios
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleReset}
                    disabled={!isConfigured || resetting}
                  >
                    {resetting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Borrar código
                  </Button>
                  {!isDirty && !isConfigured && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground pl-1">
                      <CheckCircle2 className="size-3" />
                      Sin código cargado
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-sm text-muted-foreground">
              Seleccioná una herramienta.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
