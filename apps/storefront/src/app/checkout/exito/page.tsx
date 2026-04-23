import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  searchParams: Promise<{ orden?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { orden } = await searchParams;
  return (
    <div className="container mx-auto px-4 py-16 max-w-xl text-center">
      <CheckCircle2 className="size-16 text-green-600 mx-auto mb-4" />
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        ¡Pago confirmado!
      </h1>
      {orden ? (
        <p className="text-muted-foreground">
          Tu orden{' '}
          <span className="font-mono font-semibold text-foreground">
            {orden}
          </span>{' '}
          fue pagada correctamente. Te enviamos un email con los detalles y
          estamos preparando el envío.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Tu pago fue confirmado. Te enviamos un email con los detalles.
        </p>
      )}
      <div className="flex gap-2 justify-center mt-8">
        <Link href="/productos" className={cn(buttonVariants())}>
          Seguir comprando
        </Link>
        <Link
          href="/cuenta"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Ver mis órdenes
        </Link>
      </div>
    </div>
  );
}
