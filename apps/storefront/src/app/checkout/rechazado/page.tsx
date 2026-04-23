import { XCircle } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  searchParams: Promise<{ orden?: string; motivo?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function CheckoutRejectedPage({ searchParams }: Props) {
  const { orden, motivo } = await searchParams;
  return (
    <div className="container mx-auto px-4 py-16 max-w-xl text-center">
      <XCircle className="size-16 text-destructive mx-auto mb-4" />
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        No se pudo procesar el pago
      </h1>
      <p className="text-muted-foreground">
        {motivo === 'error'
          ? 'Hubo un error al procesar el pago con la pasarela. Intentá de nuevo en unos minutos.'
          : 'La transacción fue rechazada por el banco o la pasarela. La tarjeta no fue cobrada.'}
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
