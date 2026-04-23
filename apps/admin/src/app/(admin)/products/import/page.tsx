'use client';

import {
  AlertCircle,
  ArrowLeft,
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
import { api, API_URL, apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

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

function toErrorsCsv(
  errors: ImportError[],
  warnings: ImportError[],
): string {
  const rows: string[] = ['tipo,fila,sku,mensaje'];
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  for (const e of errors) {
    rows.push(
      `error,${e.row},${escape(e.sku ?? '')},${escape(e.message)}`,
    );
  }
  for (const w of warnings) {
    rows.push(
      `warning,${w.row},${escape(w.sku ?? '')},${escape(w.message)}`,
    );
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

export default function ImportProductsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [priceIncludesTax, setPriceIncludesTax] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDone = job?.status === 'COMPLETED' || job?.status === 'FAILED';

  // Poll job status every 2s while it's active.
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

  async function handleSubmit(e: React.FormEvent) {
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
      fd.append('priceIncludesTax', priceIncludesTax ? '1' : '0');
      const res = await api<{ jobId: string; totalRows: number }>(
        '/admin/products/import',
        { method: 'POST', body: fd },
      );
      const initial = await apiGet<ImportJob>(
        `/admin/products/import/${res.jobId}`,
      );
      setJob(initial);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setFile(null);
    setJob(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const progress = job && job.totalRows > 0
    ? Math.round((job.processedRows / job.totalRows) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-3xl">
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
            Subí un CSV exportado desde WooCommerce. Máximo 5.000 productos por import.
          </p>
        </div>
      </div>

      {!job && (
        <Card>
          <CardHeader>
            <CardTitle>Archivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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

              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
                <input
                  id="priceIncludesTax"
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={priceIncludesTax}
                  onChange={(e) => setPriceIncludesTax(e.target.checked)}
                  disabled={submitting}
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

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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
                    <Upload className="size-4" />
                  )}
                  Importar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {job && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                {job.status === 'COMPLETED'
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
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Creados</p>
                <p className="text-2xl font-semibold text-emerald-600">
                  {job.successCount}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Actualizados</p>
                <p className="text-2xl font-semibold text-blue-600">
                  {job.updateCount}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Fallidos</p>
                <p
                  className={cn(
                    'text-2xl font-semibold',
                    job.failCount > 0
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {job.failCount}
                </p>
              </div>
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
                    Errores y advertencias ({(job.errors?.length ?? 0) + (job.warnings?.length ?? 0)})
                  </h3>
                  {isDone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadCsv(
                          toErrorsCsv(
                            job.errors ?? [],
                            job.warnings ?? [],
                          ),
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

      {/* Debug: show API URL helps in sslip.io envs */}
      <p className="text-xs text-muted-foreground">
        API: <code>{API_URL}</code>
      </p>
    </div>
  );
}
