'use client';

import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';

type Role = 'ADMIN' | 'CATALOG_MANAGER' | 'ORDERS_MANAGER' | 'VIEWER';

interface Admin {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'ADMIN (acceso total)' },
  { value: 'CATALOG_MANAGER', label: 'Catálogo (productos/categorías)' },
  { value: 'ORDERS_MANAGER', label: 'Órdenes + clientes' },
  { value: 'VIEWER', label: 'Solo lectura' },
];

export default function UsersPage() {
  const [data, setData] = useState<Admin[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<Admin[]>('/admin/admins');
      setData(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiPost('/admin/admins', { email, name, password, role });
      setEmail('');
      setName('');
      setPassword('');
      setRole('VIEWER');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(id: string, newRole: Role) {
    try {
      await apiPatch(`/admin/admins/${id}`, { role: newRole });
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleToggleActive(u: Admin) {
    try {
      await apiPatch(`/admin/admins/${u.id}`, { active: !u.active });
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDelete(u: Admin) {
    if (!window.confirm(`¿Eliminar a ${u.email}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiDelete(`/admin/admins/${u.id}`);
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios admin</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de admins y sus roles. Solo ADMIN puede crear, modificar o borrar otros admins.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Crear nuevo admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role">Rol</Label>
              <Select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Crear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admins ({data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {data === null ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                        className="w-52"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={u.active ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.active ? 'Activo' : 'Inactivo'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(u)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
