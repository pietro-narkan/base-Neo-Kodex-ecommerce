'use client';

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api, API_URL, apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TargetField {
  key: string;
  label: string;
}

interface PreviewResult {
  headers: string[];
  firstRow: Record<string, string> | null;
  suggestedMappings: Record<string, string | null>;
  targetFields: TargetField[];
}

interface ImportError {
  row: number;
  sku?: string;
  message: string;
}

interface ImportJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  filename: string | null;
  totalRows: number;
  processedRows: number;
  successCount: number;
  updateCount: number;
  failCount: number;
  errors: ImportError[] | null;
  warnings: ImportError[] | null;
  createdAt: string;
  completedAt: string | null;
}

type Step = 1 | 2 | 3;

function toErrorsCsv(errors: ImportError[], warnings: ImportError[]): string {
  const rows: string[] = ['tipo,fila,sku,mensaje'];
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  for (const e of errors) {
    rows.push(`error,${e.row},${escape(e.sku ?? '')},${escape(e.message)}`);
  }
  for (const w of warnings) {
    rows.push(`warning,${w.row},${escape(w.sku ?? '')},${escape(w.message)}`);
  }
  return rows.join('\n');
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const REQUIRED_FIELDS = ['sku', 'name', 'normalPrice'] as const;

export default function ImportProductsPage() {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [priceIncludesTax, setPriceIncludesTax] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDone = job?.status === 'COMPLETED' || job?.status === 'FAILED';

  useEffect(() => {
    if (!job || isDone) return;
    const timer = setInterval(async () => {
      try {
        const updated = await apiGet<ImportJob>(
          `/admin/products/import/${job.id}`,
        );
        setJob(updated);
      } catch (err) {
        setError((err as Error).message);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job, isDone]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Selecciona un archivo CSV.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api<PreviewResult>('/admin/products/import/preview', {
        method: 'POST',
        body: fd,
      });
      setPreview(res);
      setMappings({ ...res.suggestedMappings });
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRunImport() {
    if (!file) return;
    setError(null);

    // Validate required fields are mapped.
    const mappedValues = new Set(Object.values(mappings).filter(Boolean));
    const missing = REQUIRED_FIELDS.filter((f) => !mappedValues.has(f));
    if (missing.length > 0) {
      const labels = missing
        .map(
          (m) =>
            preview?.targetFields.find((f) => f.key === m)?.label ?? m,
        )
        .join(', ');
      setError(`Faltan campos obligatorios sin asignar: ${labels}`);
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('priceIncludesTax', priceIncludesTax ? '1' : '0');
      fd.append('mappings', JSON.stringify(mappings));
      const res = await api<{ jobId: string; totalRows: number }>(
        '/admin/products/import',
        { method: 'POST', body: fd },
      );
      const initial = await apiGet<ImportJob>(
        `/admin/products/import/${res.jobId}`,
      );
      setJob(initial);
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep(1);
    setFile(null);
    setPreview(null);
    setMappings({});
    setJob(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function updateMapping(header: string, field: string) {
    setMappings((prev) => ({ ...prev, [header]: field || null }));
  }

  const progress =
    job && job.totalRows > 0
      ? Math.round((job.processedRows / job.totalRows) * 100)
      : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Importar productos
          </h1>
          <p className="text-sm text-muted-foreground">
            Subí un CSV exportado desde WooCommerce o compatible. Máximo 5.000 productos por import.
          </p>
        </div>
      </div>

      <Stepper current={step} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1. Subir archivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="file">Archivo</Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={submitting}
                />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Link
                  href="/products"
                  className={cn(buttonVariants({ variant: 'outline' }))}
                >
                  Cancelar
                </Link>
                <Button type="submit" disabled={!file || submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  Siguiente
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. Asignar campos CSV a los productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Selecciona los campos de tu archivo CSV para asignarlos a los campos de producto, o para ignorarlos.
              Los campos con <span className="font-medium text-foreground">*</span> son obligatorios.
            </p>

            <div className="rounded-md border divide-y">
              {preview.headers.map((header) => {
                const sample = preview.firstRow?.[header] ?? '';
                const current = mappings[header] ?? '';
                return (
                  <div
                    key={header}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{header}</p>
                      {sample && (
                        <p className="mt-1 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words line-clamp-4">
                          Ejemplo: {sample}
                        </p>
                      )}
                    </div>
                    <div>
                      <Select
                        value={current}
                        onChange={(e) => updateMapping(header, e.target.value)}
                      >
                        <option value="">— No importar —</option>
                        {preview.targetFields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {REQUIRED_FIELDS.includes(
                              f.key as (typeof REQUIRED_FIELDS)[number],
                            )
                              ? ' *'
                              : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
              <input
                id="priceIncludesTax"
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={priceIncludesTax}
                onChange={(e) => setPriceIncludesTax(e.target.checked)}
              />
              <div className="text-sm">
                <Label htmlFor="priceIncludesTax" className="cursor-pointer">
                  Los precios del CSV incluyen IVA (19%)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Desmárcalo solo si tu CSV trae precios netos sin impuesto.
                </p>
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={reset}>
                <ArrowLeft className="size-4" />
                Atrás
              </Button>
              <Button onClick={handleRunImport} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Importar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && job && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                3. {job.status === 'COMPLETED'
                  ? 'Importación completada'
                  : job.status === 'FAILED'
                    ? 'Importación fallida'
                    : 'Importando…'}
              </span>
              {isDone && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  Importar otro
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {job.processedRows} / {job.totalRows} filas
                </span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full bg-primary transition-all duration-300',
                    job.status === 'FAILED' && 'bg-destructive',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Creados" value={job.successCount} tone="success" />
              <Stat label="Actualizados" value={job.updateCount} tone="info" />
              <Stat
                label="Fallidos"
                value={job.failCount}
                tone={job.failCount > 0 ? 'error' : 'muted'}
              />
            </div>

            {isDone && job.status === 'COMPLETED' && job.failCount === 0 && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>Todo listo</AlertTitle>
                <AlertDescription>
                  Se procesaron {job.successCount + job.updateCount} productos sin errores.
                </AlertDescription>
              </Alert>
            )}

            {(job.errors?.length ?? 0) + (job.warnings?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    Errores y advertencias (
                    {(job.errors?.length ?? 0) + (job.warnings?.length ?? 0)})
                  </h3>
                  {isDone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadCsv(
                          toErrorsCsv(job.errors ?? [], job.warnings ?? []),
                          `import-errors-${job.id}.csv`,
                        )
                      }
                    >
                      <Download className="size-4" />
                      Descargar CSV
                    </Button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
                  <ul className="divide-y">
                    {(job.errors ?? []).map((e, i) => (
                      <li key={`e-${i}`} className="px-3 py-2 bg-destructive/5">
                        <div className="flex gap-2 items-start">
                          <span className="text-xs font-mono text-destructive">
                            Fila {e.row}
                          </span>
                          {e.sku && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {e.sku}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-destructive">{e.message}</p>
                      </li>
                    ))}
                    {(job.warnings ?? []).map((w, i) => (
                      <li key={`w-${i}`} className="px-3 py-2 bg-amber-500/5">
                        <div className="flex gap-2 items-start">
                          <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
                            Fila {w.row}
                          </span>
                          {w.sku && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {w.sku}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          {w.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        API: <code>{API_URL}</code>
      </p>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Subir CSV' },
    { n: 2, label: 'Asignar columnas' },
    { n: 3, label: 'Importar' },
  ];
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div
            className={cn(
              'flex size-7 items-center justify-center rounded-full font-medium text-xs transition-colors',
              current > s.n
                ? 'bg-primary text-primary-foreground'
                : current === s.n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {current > s.n ? <CheckCircle2 className="size-4" /> : s.n}
          </div>
          <span
            className={cn(
              current === s.n
                ? 'font-medium'
                : 'text-muted-foreground',
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className="mx-2 h-px w-8 bg-border" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'info' | 'error' | 'muted';
}) {
  const color =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'info'
        ? 'text-blue-600'
        : tone === 'error'
          ? 'text-destructive'
          : 'text-muted-foreground';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-semibold', color)}>{value}</p>
    </div>
  );
}
