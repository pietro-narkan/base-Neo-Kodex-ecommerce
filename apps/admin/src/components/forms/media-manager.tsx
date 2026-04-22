'use client';

import { Loader2, Trash2, Upload } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { API_URL, apiDelete } from '@/lib/api';

interface Media {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

interface Props {
  productId?: string;
  variantId?: string;
  initialMedia: Media[];
}

export function MediaManager({ productId, variantId, initialMedia }: Props) {
  const [media, setMedia] = useState<Media[]>(initialMedia);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (productId) formData.append('productId', productId);
      if (variantId) formData.append('variantId', variantId);

      const token = localStorage.getItem('nk_token');
      const res = await fetch(`${API_URL}/admin/media`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({
          message: res.statusText,
        }))) as { message?: string };
        throw new Error(body.message || res.statusText);
      }
      const newMedia = (await res.json()) as Media;
      setMedia((prev) => [...prev, newMedia]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    try {
      await apiDelete(`/admin/media/${id}`);
      setMedia((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Subir imagen
        </Button>
        {error && (
          <p className="text-xs text-destructive mt-2">{error}</p>
        )}
      </div>

      {media.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Sin imágenes todavía.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((m) => (
            <div
              key={m.id}
              className="group relative aspect-square rounded-lg border overflow-hidden bg-muted/30"
            >
              <Image
                src={m.url}
                alt={m.alt ?? ''}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-md p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                aria-label="Eliminar imagen"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
