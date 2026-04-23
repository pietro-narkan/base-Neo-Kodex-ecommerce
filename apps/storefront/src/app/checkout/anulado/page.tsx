import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  searchParams: Promise<{ orden?: string; motivo?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function CheckoutAbortedPage({ searchParams }: Props) {
  const { orden, motivo } = await searchParams;
  const wasTimeout = motivo === 'timeout';
  return (
    <div className="container mx-auto px-4 py-16 max-w-xl text-center">
      <AlertCircle className="size-16 text-amber-500 mx-auto mb-4" />
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        {wasTimeout ? 'El tiempo para pagar expiró' : 'Pago cancelado'}
      </h1>
      <p className="text-muted-foreground">
        {wasTimeout
          ? 'Pasaron los minutos del formulario de la pasarela sin completar el pago. Tu tarjeta no fue cobrada.'
          : 'Cancelaste el pago en la pasarela. Tu tarjeta no fue cobrada.'}
      </p>
      {orden && (
        <p className="text-sm text-muted-foreground mt-2">
          Orden:{' '}
          <span className="font-mono font-semibold text-foreground">
            {orden}
          </span>
          . Podés reintentar el pago desde tu cuenta.
        </p>
      )}
      <div className="flex gap-2 justify-center mt-8">
        <Link href="/checkout" className={cn(buttonVariants())}>
          Reintentar
        </Link>
        <Link
          href="/productos"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Volver al catálogo
        </Link>
      </div>
    </div>
  );
}
