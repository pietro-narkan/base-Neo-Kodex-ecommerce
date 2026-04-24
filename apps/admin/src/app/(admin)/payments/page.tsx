'use client';

import {
  AlertCircle,
  Check,
  CreditCard,
  Loader2,
  Save,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

type ProviderId = 'manual' | 'webpay' | 'mercadopago' | 'flow';

interface WebpayAdminView {
  environment: 'integration' | 'production';
  commerceCode: string;
  apiKeyConfigured: boolean;
}

interface PaymentMethod {
  id: ProviderId;
  name: string;
  description: string;
  active: boolean;
  configured: boolean;
  available: boolean;
  config?: { bankDetails?: string; webpay?: WebpayAdminView };
}

interface Response {
  enabledProviders: ProviderId[];
  methods: PaymentMethod[];
}

export default function PaymentsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bankDetailsDraft, setBankDetailsDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [webpayEnv, setWebpayEnv] = useState<'integration' | 'production'>(
    'integration',
  );
  const [webpayCommerceCode, setWebpayCommerceCode] = useState('');
  const [webpayApiKey, setWebpayApiKey] = useState('');
  const [savingWebpay, setSavingWebpay] = useState(false);
  const [togglingId, setTogglingId] = useState<ProviderId | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<Response>('/admin/payments');
      setData(res);
      const manual = res.methods.find((m) => m.id === 'manual');
      setBankDetailsDraft(manual?.config?.bankDetails ?? '');
      const webpay = res.methods.find((m) => m.id === 'webpay')?.config?.webpay;
      if (webpay) {
        setWebpayEnv(webpay.environment);
        setWebpayCommerceCode(webpay.commerceCode);
        setWebpayApiKey(''); // nunca exponemos la guardada — vacío = "no cambiar"
      }
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

  async function saveWebpay() {
    setSavingWebpay(true);
    setError(null);
    setNotice(null);
    try {
      await api('/admin/payments/webpay/config', {
        method: 'PUT',
        body: {
          environment: webpayEnv,
          commerceCode: webpayCommerceCode,
          // Si el admin dejó el input vacío, no cambiamos la apiKey guardada.
          ...(webpayApiKey ? { apiKey: webpayApiKey } : {}),
        },
      });
      setNotice('Credenciales de Webpay guardadas.');
      setTimeout(() => setNotice(null), 2500);
      setWebpayApiKey('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingWebpay(false);
    }
  }

  async function toggleMethod(provider: ProviderId, wasActive: boolean) {
    if (!data) return;
    setTogglingId(provider);
    setError(null);
    setNotice(null);
    try {
      const current = data.enabledProviders.filter((p) => p !== provider);
      const next = wasActive ? current : [...current, provider];
      await api('/admin/payments/enabled', {
        method: 'PUT',
        body: { providers: next },
      });
      setNotice(
        wasActive
          ? `"${provider}" desactivado.`
          : `"${provider}" activado — el cliente ya puede elegirlo en el checkout.`,
      );
      setTimeout(() => setNotice(null), 3000);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTogglingId(null);
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
          Podés habilitar varios métodos al mismo tiempo — el cliente elige uno
          antes de confirmar la compra.{' '}
          {data.enabledProviders.length > 0 ? (
            <>
              Activos:{' '}
              {data.enabledProviders.map((p, i) => (
                <span key={p}>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                    {p}
                  </code>
                  {i < data.enabledProviders.length - 1 && ', '}
                </span>
              ))}
              .
            </>
          ) : (
            <span className="text-destructive">
              Ningún método habilitado — ningún cliente va a poder completar un
              checkout hasta que actives al menos uno.
            </span>
          )}
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
            <CardTitle className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <CreditCard className="size-5 text-muted-foreground" />
                <span>{m.name}</span>
                {!m.available && <Badge variant="secondary">No integrado</Badge>}
                {m.available && m.configured && (
                  <Badge variant="outline">Configurado</Badge>
                )}
                {m.available && !m.configured && (
                  <Badge variant="warning">Falta configurar</Badge>
                )}
              </div>
              {m.available && (
                <label
                  className={cn(
                    'flex items-center gap-2 select-none',
                    (!m.configured || togglingId === m.id) &&
                      'opacity-60 cursor-not-allowed',
                  )}
                  title={
                    m.configured
                      ? 'Habilitar/deshabilitar este método'
                      : 'Primero completá la configuración'
                  }
                >
                  <span className="text-sm font-medium">
                    {m.active ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.active}
                    disabled={!m.configured || togglingId !== null}
                    onClick={() => toggleMethod(m.id, m.active)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
                      m.active ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-4 rounded-full bg-background shadow transition-transform',
                        m.active ? 'translate-x-[18px]' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                  {togglingId === m.id && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </label>
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

            {/* Webpay Plus config */}
            {m.id === 'webpay' && (
              <div className="space-y-3 pt-2 border-t">
                <div className="rounded-md border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  En <strong>integración</strong> podés dejar los campos en
                  blanco y el sistema usa las{' '}
                  <strong>credenciales públicas de Transbank</strong> para
                  testear con sus tarjetas de prueba. Para <strong>producción</strong>{' '}
                  necesitás el commerce code (12 dígitos) y la API key que
                  Transbank te envía por email al aprobar la puesta en marcha.
                </div>

                <div className="space-y-1.5">
                  <Label>Ambiente</Label>
                  <div className="flex gap-2">
                    {(['integration', 'production'] as const).map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => setWebpayEnv(env)}
                        className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                          webpayEnv === env
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-accent'
                        }`}
                      >
                        {env === 'integration' ? 'Integración (pruebas)' : 'Producción'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="webpay-cc">Commerce Code</Label>
                  <Input
                    id="webpay-cc"
                    value={webpayCommerceCode}
                    onChange={(e) => setWebpayCommerceCode(e.target.value)}
                    placeholder={
                      webpayEnv === 'integration'
                        ? 'Dejá vacío para usar el público de pruebas'
                        : 'ej. 597012345678'
                    }
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="webpay-key">
                    API Key{' '}
                    {m.config?.webpay?.apiKeyConfigured && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (ya guardada — dejá vacío para no cambiarla)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="webpay-key"
                    type="password"
                    value={webpayApiKey}
                    onChange={(e) => setWebpayApiKey(e.target.value)}
                    placeholder={
                      webpayEnv === 'integration'
                        ? 'Dejá vacío para usar la pública de pruebas'
                        : 'llave secreta que te envió Transbank'
                    }
                    className="font-mono text-sm"
                    autoComplete="off"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveWebpay} disabled={savingWebpay}>
                    {savingWebpay ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Guardar credenciales
                  </Button>
                </div>
              </div>
            )}

            {/* Not-yet-integrated providers */}
            {!m.available && (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
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
          Podés tener <strong>varios métodos activos a la vez</strong> — el
          cliente ve los que actives en el checkout y elige uno antes de
          confirmar. Las órdenes viejas conservan el método con el que fueron
          pagadas (importante para reembolsos).
        </p>
      </div>
    </div>
  );
}
