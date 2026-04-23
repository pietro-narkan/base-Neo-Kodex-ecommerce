'use client';

import { AlertCircle, Check, CreditCard, Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet } from '@/lib/api';

type ProviderId = 'manual' | 'webpay' | 'mercadopago' | 'flow';

interface PaymentMethod {
  id: ProviderId;
  name: string;
  description: string;
  active: boolean;
  configured: boolean;
  available: boolean;
  config?: { bankDetails?: string };
}

interface Response {
  activeProvider: ProviderId;
  methods: PaymentMethod[];
}

export default function PaymentsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bankDetailsDraft, setBankDetailsDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<Response>('/admin/payments');
      setData(res);
      const manual = res.methods.find((m) => m.id === 'manual');
      setBankDetailsDraft(manual?.config?.bankDetails ?? '');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBankDetails() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api('/admin/payments/manual/bank-details', {
        method: 'PUT',
        body: { value: bankDetailsDraft },
      });
      setNotice('Datos bancarios actualizados');
      setTimeout(() => setNotice(null), 2500);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (data === null) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Métodos de pago</h1>
        <p className="text-sm text-muted-foreground">
          Medio de pago activo actualmente:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {data.activeProvider}
          </code>
          . El medio se cambia via la variable de entorno{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            PAYMENT_PROVIDER
          </code>{' '}
          en Coolify (requiere redeploy).
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <Check className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {data.methods.map((m) => (
        <Card
          key={m.id}
          className={m.active ? 'border-primary/40 bg-primary/5' : undefined}
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-muted-foreground" />
                <span>{m.name}</span>
                {m.active && <Badge variant="success">Activo</Badge>}
                {!m.available && <Badge variant="secondary">No integrado</Badge>}
                {m.available && !m.active && (
                  <Badge variant="secondary">Inactivo</Badge>
                )}
              </div>
              {m.available && m.configured && (
                <Badge variant="outline">Configurado</Badge>
              )}
              {m.available && !m.configured && (
                <Badge variant="warning">Falta configurar</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{m.description}</p>

            {/* Manual transfer: editable bank details */}
            {m.id === 'manual' && (
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="bankDetails">
                  Datos bancarios (se muestran al cliente en el checkout)
                </Label>
                <Textarea
                  id="bankDetails"
                  rows={6}
                  value={bankDetailsDraft}
                  onChange={(e) => setBankDetailsDraft(e.target.value)}
                  placeholder={`Banco Estado\nCuenta Corriente\nRUT: 12.345.678-9\nNº cuenta: 12345678\nTitular: Tu Empresa SpA\nEmail para enviar comprobante: ventas@tu-tienda.cl`}
                  className="font-mono text-sm"
                />
                <div className="flex justify-end">
                  <Button onClick={saveBankDetails} disabled={saving}>
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Guardar datos bancarios
                  </Button>
                </div>
              </div>
            )}

            {/* Not-yet-integrated providers */}
            {!m.available && (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                {m.id === 'webpay' &&
                  'Para activar: firmar contrato con Transbank + obtener credenciales de producción + implementar la clase WebpayPaymentProvider en apps/api/src/providers/payment.service.ts.'}
                {m.id === 'mercadopago' &&
                  'Para activar: crear cuenta de vendedor en Mercado Pago Argentina/Chile, obtener Access Token, implementar MercadoPagoPaymentProvider.'}
                {m.id === 'flow' &&
                  'Para activar: contrato + API Key de Flow, implementar FlowPaymentProvider.'}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">¿Cómo funciona?</p>
        <p>
          Hoy solo un método de pago está activo a la vez, elegido por la
          variable{' '}
          <code className="rounded bg-background px-1 text-xs font-mono">
            PAYMENT_PROVIDER
          </code>
          . Cuando se integren pasarelas reales como Webpay o Mercado Pago,
          esta pantalla permitirá activar múltiples al mismo tiempo y el
          cliente elegirá en el checkout.
        </p>
      </div>
    </div>
  );
}
