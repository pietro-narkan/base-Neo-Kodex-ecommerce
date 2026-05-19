'use client';

import { Copy, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  secret: string;
  onClose: () => void;
}

export function SecretRevealModal({ open, secret, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl p-6 max-w-lg w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Secret generado</h2>
          <button onClick={onClose} aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong>Guardalo ahora.</strong> Este es el único momento en que se muestra. Si lo perdés,
          podés rotar el secret desde la página de detalle.
        </p>
        <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">{secret}</div>
        <div className="flex gap-2">
          <Button onClick={copy} variant="outline" className="flex-1">
            <Copy className="size-4" />
            {copied ? 'Copiado!' : 'Copiar'}
          </Button>
          <Button onClick={onClose} className="flex-1">
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}
