'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SecretRevealModal } from '@/components/webhooks/secret-reveal-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost } from '@/lib/api';

const EVENT_OPTIONS = [
  'order.created',
  'order.paid',
  'order.fulfilled',
  'order.cancelled',
  'order.refunded',
] as const;

const formSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  url: z.string().url('URL inválida'),
  events: z.array(z.enum(EVENT_OPTIONS)).min(1, 'Elegí al menos un evento'),
  active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function WebhookForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{
    id: string;
    secret: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', url: '', events: [], active: true },
  });

  const selectedEvents = watch('events');

  function toggleEvent(event: (typeof EVENT_OPTIONS)[number]) {
    const next = selectedEvents.includes(event)
      ? selectedEvents.filter((e) => e !== event)
      : [...selectedEvents, event];
    setValue('events', next, { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const created = await apiPost<{ id: string; secret: string }>(
        '/admin/webhooks',
        values,
      );
      setRevealedSecret({ id: created.id, secret: created.secret });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleModalClose() {
    if (!revealedSecret) return;
    router.push(`/webhooks/${revealedSecret.id}`);
  }

  return (
    <>
      <form className="space-y-4 max-w-2xl" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="url">URL</Label>
          <Input id="url" type="url" {...register('url')} placeholder="https://..." />
          {errors.url && <p className="text-sm text-destructive">{errors.url.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Eventos</Label>
          <div className="space-y-1">
            {EVENT_OPTIONS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
                <code>{event}</code>
              </label>
            ))}
          </div>
          {errors.events && (
            <p className="text-sm text-destructive">{errors.events.message}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="active" {...register('active')} />
          <Label htmlFor="active">Activo</Label>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Crear webhook
        </Button>
      </form>
      <SecretRevealModal
        open={revealedSecret !== null}
        secret={revealedSecret?.secret ?? ''}
        onClose={handleModalClose}
      />
    </>
  );
}
