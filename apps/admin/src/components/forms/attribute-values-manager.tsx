'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiDelete, apiPost } from '@/lib/api';

export interface AttributeValue {
  id: string;
  value: string;
  slug: string;
  attributeId: string;
}

interface Props {
  attributeId: string;
  initialValues: AttributeValue[];
}

export function AttributeValuesManager({ attributeId, initialValues }: Props) {
  const [values, setValues] = useState<AttributeValue[]>(initialValues);
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setError(null);
    setAdding(true);
    try {
      const v = await apiPost<AttributeValue>(
        `/admin/attributes/${attributeId}/values`,
        { value: trimmed },
      );
      setValues((prev) => [...prev, v].sort((a, b) => a.value.localeCompare(b.value)));
      setNewValue('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(valueId: string, label: string) {
    if (!window.confirm(`¿Eliminar el valor "${label}"?`)) return;
    try {
      await apiDelete(`/admin/attributes/${attributeId}/values/${valueId}`);
      setValues((prev) => prev.filter((v) => v.id !== valueId));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl border-t pt-6 mt-6">
      <div>
        <h2 className="text-lg font-semibold">Valores del atributo</h2>
        <p className="text-sm text-muted-foreground">
          Opciones concretas. Por ejemplo, para &quot;Color&quot; podrían ser
          Rojo, Azul, Verde.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 min-h-8">
        {values.length === 0 ? (
          <span className="text-sm text-muted-foreground italic">
            No hay valores todavía.
          </span>
        ) : (
          values.map((v) => (
            <div
              key={v.id}
              className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
            >
              <span className="font-medium">{v.value}</span>
              <span className="text-xs font-mono text-muted-foreground">
                {v.slug}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(v.id, v.value)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Eliminar ${v.value}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="new-value">Agregar valor</Label>
          <Input
            id="new-value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder="Ej: Rojo"
          />
        </div>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newValue.trim()}
        >
          {adding ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Agregar
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
