'use client';

import { Loader2, Send, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ReviewsSettings {
  enabled: boolean;
  starsEnabled: boolean;
  starsRequired: boolean;
}

interface PublicReview {
  id: string;
  firstName: string;
  rating: number | null;
  title: string | null;
  comment: string;
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
  isVerifiedPurchase: boolean;
}

interface ReviewStats {
  count: number;
  average: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

interface ListResponse {
  items: PublicReview[];
  total: number;
  page: number;
  limit: number;
  stats: ReviewStats;
}

export function ReviewsSection({ productId }: { productId: string }) {
  const [settings, setSettings] = useState<ReviewsSettings | null>(null);
  const [list, setList] = useState<ListResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const res = await apiGet<ListResponse>(
        `/reviews?productId=${encodeURIComponent(productId)}`,
      );
      setList(res);
    } catch {
      // silencio intencional — si el API falla no mostramos sección
    }
  }, [productId]);

  useEffect(() => {
    apiGet<ReviewsSettings>('/reviews/settings')
      .then(setSettings)
      .catch(() => setSettings({ enabled: false, starsEnabled: true, starsRequired: false }));
  }, []);

  useEffect(() => {
    if (settings?.enabled) {
      loadList();
    }
  }, [settings?.enabled, loadList]);

  if (!settings?.enabled) return null;

  const stats = list?.stats;
  const reviews = list?.items ?? [];

  return (
    <section className="border-t pt-10 mt-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Valoraciones</h2>
          {stats && stats.count > 0 ? (
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Stars value={Math.round(stats.average)} />
              <span className="font-medium text-foreground">
                {stats.average.toFixed(1)}
              </span>
              <span>
                ({stats.count} {stats.count === 1 ? 'valoración' : 'valoraciones'})
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Todavía no hay valoraciones — ¡sé el primero!
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancelar' : 'Dejar valoración'}
        </Button>
      </div>

      {formOpen && settings && (
        <ReviewForm
          productId={productId}
          settings={settings}
          onSubmitted={() => {
            setFormOpen(false);
            // La review queda PENDING hasta que el admin la apruebe, por eso no
            // refrescamos el listado (igual no aparecería), pero avisamos al
            // usuario en el propio formulario.
          }}
        />
      )}

      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((r) => (
            <article key={r.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.firstName}</span>
                    {r.isVerifiedPurchase && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30">
                        Compra verificada
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString('es-CL', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                </div>
                {r.rating != null && <Stars value={r.rating} />}
              </div>
              {r.title && <h3 className="font-medium">{r.title}</h3>}
              <p className="text-sm whitespace-pre-line">{r.comment}</p>
              {r.adminReply && (
                <div className="mt-2 rounded-md bg-muted/40 border-l-2 border-primary/60 px-3 py-2 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Respuesta de la tienda
                  </div>
                  <p className="whitespace-pre-line">{r.adminReply}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Form
// ============================================================

function ReviewForm({
  productId,
  settings,
  onSubmitted,
}: {
  productId: string;
  settings: ReviewsSettings;
  onSubmitted: () => void;
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pre-check de elegibilidad con debounce al escribir el email — evita que
  // el cliente escriba una review larga y después se entere que no es elegible.
  const [eligibility, setEligibility] = useState<
    | null
    | { eligible: true }
    | { eligible: false; reason: 'no_purchase' | 'already_reviewed' }
  >(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);

  useEffect(() => {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEligibility(null);
      return;
    }
    setCheckingEligibility(true);
    const handle = setTimeout(async () => {
      try {
        const res = await apiGet<{
          eligible: boolean;
          reason?: 'no_purchase' | 'already_reviewed' | 'product_not_found';
        }>(
          `/reviews/eligibility?productId=${encodeURIComponent(
            productId,
          )}&email=${encodeURIComponent(normalized)}`,
        );
        if (res.eligible) {
          setEligibility({ eligible: true });
        } else if (
          res.reason === 'no_purchase' ||
          res.reason === 'already_reviewed'
        ) {
          setEligibility({ eligible: false, reason: res.reason });
        } else {
          setEligibility(null);
        }
      } catch {
        setEligibility(null);
      } finally {
        setCheckingEligibility(false);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [email, productId]);

  const starsValid =
    !settings.starsEnabled ||
    !settings.starsRequired ||
    (rating !== null && rating >= 1 && rating <= 5);

  const canSubmit =
    email.trim() !== '' &&
    firstName.trim() !== '' &&
    comment.trim().length >= 10 &&
    starsValid &&
    eligibility?.eligible === true &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api('/reviews', {
        method: 'POST',
        body: {
          productId,
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          rating: settings.starsEnabled ? rating ?? undefined : undefined,
          title: title.trim() || undefined,
          comment: comment.trim(),
        },
      });
      setSuccess(
        '¡Gracias! Tu valoración fue enviada y se publicará una vez que la revisemos.',
      );
      setEmail('');
      setFirstName('');
      setRating(null);
      setTitle('');
      setComment('');
      setEligibility(null);
      setTimeout(() => {
        onSubmitted();
      }, 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border rounded-lg p-4 space-y-4 bg-muted/20"
    >
      <div className="space-y-1">
        <h3 className="font-medium">Dejá tu valoración</h3>
        <p className="text-xs text-muted-foreground">
          Para dejar una valoración tu email tiene que figurar en alguna compra
          pagada de este producto.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rev-email">Email</Label>
          <Input
            id="rev-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="el que usaste al comprar"
            required
          />
          {checkingEligibility && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Verificando compra…
            </p>
          )}
          {eligibility?.eligible === false &&
            eligibility.reason === 'no_purchase' && (
              <p className="text-xs text-destructive">
                No encontramos una compra tuya de este producto con ese email.
              </p>
            )}
          {eligibility?.eligible === false &&
            eligibility.reason === 'already_reviewed' && (
              <p className="text-xs text-destructive">
                Ya dejaste una valoración para este producto.
              </p>
            )}
          {eligibility?.eligible === true && (
            <p className="text-xs text-green-700 dark:text-green-400">
              ¡Compra verificada! Podés dejar tu valoración.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rev-firstname">Nombre</Label>
          <Input
            id="rev-firstname"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="cómo querés firmar"
            required
          />
        </div>
      </div>

      {settings.starsEnabled && (
        <div className="space-y-1.5">
          <Label>
            Puntuación
            {settings.starsRequired && (
              <span className="text-destructive ml-1">*</span>
            )}
          </Label>
          <StarPicker value={rating} onChange={setRating} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="rev-title">Título (opcional)</Label>
        <Input
          id="rev-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Un resumen breve"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rev-comment">Comentario</Label>
        <Textarea
          id="rev-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          required
          minLength={10}
          maxLength={3000}
          placeholder="Contanos tu experiencia con el producto (mínimo 10 caracteres)"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Enviar valoración
        </Button>
      </div>
    </form>
  );
}

// ============================================================
// UI bits
// ============================================================

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'size-4',
            n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
          )}
        />
      ))}
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;
  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          className="p-0.5"
          aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
        >
          <Star
            className={cn(
              'size-6 transition-colors',
              n <= display
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/40 hover:text-amber-300',
            )}
          />
        </button>
      ))}
      {value !== null && (
        <span className="ml-2 text-sm text-muted-foreground">
          {value} de 5
        </span>
      )}
    </div>
  );
}
