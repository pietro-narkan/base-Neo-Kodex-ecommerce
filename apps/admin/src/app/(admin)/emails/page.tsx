'use client';

import {
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  Send,
  User as UserIcon,
  Users as UsersIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Placeholder {
  name: string;
  description: string;
}

interface Template {
  id: string;
  label: string;
  description: string;
  audience: 'customer' | 'admin';
  placeholders: Placeholder[];
  defaults: { subject: string; html: string };
  current: { subject: string; html: string };
  isCustomized: boolean;
  mockData: Record<string, string>;
}

interface RenderedPreview {
  subject: string;
  html: string;
  text: string;
}

export default function EmailsPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<RenderedPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testFormOpen, setTestFormOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<Template[]>('/admin/email-templates');
      setTemplates(res);
      if (res.length > 0 && !selectedId) {
        setSelectedId(res[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selectedId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const selected = useMemo(
    () => templates?.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  // Sincroniza drafts cuando cambia la plantilla seleccionada.
  useEffect(() => {
    if (!selected) return;
    setDraftSubject(selected.current.subject);
    setDraftHtml(selected.current.html);
    setPreview(null);
    setError(null);
    setNotice(null);
    setTestFormOpen(false);
  }, [selected?.id, selected?.current.subject, selected?.current.html]);

  const isDirty =
    !!selected &&
    (draftSubject !== selected.current.subject ||
      draftHtml !== selected.current.html);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/admin/email-templates/${encodeURIComponent(selected.id)}`, {
        method: 'PUT',
        body: { subject: draftSubject, html: draftHtml },
      });
      setNotice(`"${selected.label}" actualizado.`);
      setTimeout(() => setNotice(null), 2500);
      await loadList();
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
        `¿Restaurar la plantilla "${selected.label}" al texto por defecto? Se perderán los cambios guardados.`,
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost(
        `/admin/email-templates/${encodeURIComponent(selected.id)}/reset`,
      );
      setNotice('Plantilla restaurada.');
      setTimeout(() => setNotice(null), 2500);
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  async function handleSendTest() {
    if (!selected) return;
    const to = testEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError('Ingresá un email válido.');
      return;
    }
    setSendingTest(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ ok: true; provider: string }>(
        `/admin/email-templates/${encodeURIComponent(selected.id)}/send-test`,
        {
          method: 'POST',
          body: { to, subject: draftSubject, html: draftHtml },
        },
      );
      const providerNote =
        res.provider === 'console' || res.provider === 'noop'
          ? ` (proveedor "${res.provider}" — el correo no se envía de verdad, revisá los logs del servidor)`
          : ` (proveedor "${res.provider}")`;
      setNotice(`Correo de prueba enviado a ${to}${providerNote}.`);
      setTimeout(() => setNotice(null), 6000);
      setTestFormOpen(false);
      setTestEmail('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSendingTest(false);
    }
  }

  async function handlePreview() {
    if (!selected) return;
    setLoadingPreview(true);
    setError(null);
    try {
      // Si hay cambios sin guardar, guardar y luego preview — sino el preview
      // va a mostrar la versión anterior. Para evitar "surprise save", solo
      // renderizamos client-side con los drafts + mockData.
      const rendered = renderClientSide(
        { subject: draftSubject, html: draftHtml },
        selected.mockData,
      );
      setPreview(rendered);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  if (templates === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Correos</h1>
        <p className="text-sm text-muted-foreground">
          Plantillas de los emails automáticos de la tienda. Solo ADMIN puede
          modificar.
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
        {/* Sidebar interno con la lista de plantillas */}
        <aside className="border rounded-lg bg-card overflow-hidden">
          <div className="divide-y">
            {templates.map((t) => {
              const active = t.id === selectedId;
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
                  <Mail
                    className={cn(
                      'size-4 mt-0.5 shrink-0',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{t.label}</span>
                      {t.isCustomized && (
                        <span
                          title="Plantilla modificada"
                          className="size-1.5 rounded-full bg-primary shrink-0"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                      {t.audience === 'admin' ? (
                        <UsersIcon className="size-3" />
                      ) : (
                        <UserIcon className="size-3" />
                      )}
                      <span>
                        {t.audience === 'admin' ? 'Admin' : 'Cliente'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Editor */}
        <div className="space-y-4 min-w-0">
          {selected ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {selected.label}
                      {selected.isCustomized ? (
                        <Badge variant="secondary">Modificada</Badge>
                      ) : (
                        <Badge variant="outline">Default</Badge>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {selected.description}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {selected.id}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="subject">Asunto</Label>
                    <Input
                      id="subject"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="html">Cuerpo (HTML)</Label>
                    <Textarea
                      id="html"
                      rows={14}
                      value={draftHtml}
                      onChange={(e) => setDraftHtml(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      El texto plano se genera automáticamente a partir del
                      HTML al enviar.
                    </p>
                  </div>

                  {selected.placeholders.length > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Variables disponibles
                      </div>
                      <ul className="space-y-1 text-sm">
                        {selected.placeholders.map((p) => (
                          <li key={p.name} className="flex gap-2">
                            <code className="text-xs bg-background px-1.5 py-0.5 rounded border font-mono shrink-0">
                              {`{{${p.name}}}`}
                            </code>
                            <span className="text-muted-foreground text-xs pt-0.5">
                              {p.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                      variant="outline"
                      onClick={handlePreview}
                      disabled={loadingPreview}
                    >
                      {loadingPreview ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                      Previsualizar con datos de ejemplo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setTestFormOpen((v) => !v)}
                    >
                      <Send className="size-4" />
                      Enviar correo de prueba
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleReset}
                      disabled={!selected.isCustomized || resetting}
                    >
                      {resetting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      Restaurar default
                    </Button>
                    {!isDirty && !selected.isCustomized && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground pl-1">
                        <CheckCircle2 className="size-3" />
                        Usando el texto por defecto
                      </span>
                    )}
                  </div>

                  {testFormOpen && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <Label htmlFor="test-email" className="text-sm">
                        Email de destino
                      </Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id="test-email"
                          type="email"
                          placeholder="tu@correo.com"
                          value={testEmail}
                          autoFocus
                          onChange={(e) => setTestEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSendTest();
                            }
                          }}
                          className="flex-1"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSendTest}
                            disabled={sendingTest || !testEmail.trim()}
                          >
                            {sendingTest ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            Enviar
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setTestFormOpen(false);
                              setTestEmail('');
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Se envía el contenido del editor (incluyendo cambios no
                        guardados) renderizado con los datos de ejemplo. El
                        asunto lleva el prefijo [PRUEBA].
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {preview && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Previsualización
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Renderizado con los drafts actuales + datos de ejemplo.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Asunto: </span>
                      <span className="font-medium">{preview.subject}</span>
                    </div>
                    <div
                      className="border rounded-md p-4 bg-background overflow-auto email-preview"
                      dangerouslySetInnerHTML={{ __html: preview.html }}
                    />
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Seleccioná una plantilla.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Reemplazo simple de `{{var}}` (soportando espacios) — espejo del renderer
 * del backend. Se usa client-side para preview inmediato mientras el admin
 * escribe, sin necesidad de guardar antes.
 */
function renderClientSide(
  tpl: { subject: string; html: string },
  vars: Record<string, string>,
): RenderedPreview {
  const render = (s: string) =>
    s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => vars[name] ?? '');
  const html = render(tpl.html);
  const text = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|table)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { subject: render(tpl.subject), html, text };
}
