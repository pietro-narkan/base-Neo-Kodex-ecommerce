'use client';

import { Loader2, Save } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (next !== confirm) {
      setError('La nueva contraseña y la confirmación no coinciden');
      return;
    }
    if (next.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    setSaving(true);
    try {
      await api('/admin/admins/me/password', {
        method: 'PATCH',
        body: { currentPassword: current, newPassword: next },
      });
      setNotice('Contraseña actualizada correctamente');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-sm text-muted-foreground">
          {user?.email} · {user?.role ?? '—'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="current">Contraseña actual</Label>
              <Input
                id="current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="next">Contraseña nueva</Label>
              <Input
                id="next"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                minLength={8}
                required
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 8 caracteres.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirmar nueva</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
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

            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Guardar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
