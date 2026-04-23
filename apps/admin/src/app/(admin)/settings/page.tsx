'use client';

import { Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet } from '@/lib/api';

interface Setting {
  key: string;
  label: string;
  type: 'string' | 'text' | 'number' | 'email' | 'json';
  group: string;
  value: unknown;
}

// Serialize a setting value for the input based on its declared type.
function serialize(value: unknown, type: Setting['type']): string {
  if (value === null || value === undefined) return '';
  if (type === 'json') return JSON.stringify(value, null, 2);
  if (type === 'number') return String(value);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function deserialize(raw: string, type: Setting['type']): unknown {
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error('Número inválido');
    return n;
  }
  if (type === 'json') {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('JSON inválido');
    }
  }
  return raw;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<Setting[]>('/admin/settings');
      setSettings(res);
      const newDrafts: Record<string, string> = {};
      for (const s of res) newDrafts[s.key] = serialize(s.value, s.type);
      setDrafts(newDrafts);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(s: Setting) {
    setSavingKey(s.key);
    setError(null);
    setNotice(null);
    try {
      const raw = drafts[s.key] ?? '';
      const parsed = deserialize(raw, s.type);
      await api(`/admin/settings/${encodeURIComponent(s.key)}`, {
        method: 'PUT',
        body: { value: parsed },
      });
      setNotice(`"${s.label}" actualizado`);
      setTimeout(() => setNotice(null), 2500);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  const groups = useMemo(() => {
    if (!settings) return [];
    const byGroup = new Map<string, Setting[]>();
    for (const s of settings) {
      const list = byGroup.get(s.group) ?? [];
      list.push(s);
      byGroup.set(s.group, list);
    }
    return Array.from(byGroup.entries());
  }, [settings]);

  if (settings === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Valores del sistema editables en caliente. Solo ADMIN puede modificar.
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

      {groups.map(([group, items]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((s) => (
              <div key={s.key} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor={s.key}>{s.label}</Label>
                  <p className="text-xs text-muted-foreground font-mono">{s.key}</p>
                  {s.type === 'text' || s.type === 'json' ? (
                    <Textarea
                      id={s.key}
                      rows={s.type === 'json' ? 6 : 3}
                      value={drafts[s.key] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      id={s.key}
                      type={s.type === 'number' ? 'number' : s.type === 'email' ? 'email' : 'text'}
                      value={drafts[s.key] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                      }
                    />
                  )}
                </div>
                <Button
                  onClick={() => handleSave(s)}
                  disabled={savingKey === s.key}
                  variant="outline"
                  size="sm"
                >
                  {savingKey === s.key ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
