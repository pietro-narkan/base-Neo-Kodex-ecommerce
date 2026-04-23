'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

type Severity = 'critical' | 'warning' | 'good';

interface SeoIssue {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  affectedCount: number;
  samples: Array<{ id: string; name: string; editPath: string }>;
}

interface AuditResult {
  summary: {
    critical: number;
    warning: number;
    good: number;
    score: number;
    checkedAt: string;
  };
  issues: SeoIssue[];
}

function severityConfig(severity: Severity) {
  switch (severity) {
    case 'critical':
      return {
        icon: XCircle,
        colorClass: 'text-destructive',
        borderClass: 'border-l-destructive',
        bgClass: 'bg-destructive/5',
        label: 'Crítico',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        colorClass: 'text-amber-600 dark:text-amber-500',
        borderClass: 'border-l-amber-500',
        bgClass: 'bg-amber-500/5',
        label: 'Advertencia',
      };
    case 'good':
      return {
        icon: CheckCircle2,
        colorClass: 'text-emerald-600 dark:text-emerald-500',
        borderClass: 'border-l-emerald-500',
        bgClass: 'bg-emerald-500/5',
        label: 'Info',
      };
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-destructive';
}

export default function SeoPage() {
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<AuditResult>('/admin/seo/audit');
      setData(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SEO</h1>
          <p className="text-sm text-muted-foreground">
            Auditoría automática del catálogo y la configuración de tienda.
            Arregla lo crítico para que Google posicione bien y los clientes
            vean previews completos al compartir links.
          </p>
        </div>
        <Button onClick={run} disabled={loading} variant="outline">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Re-escanear
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data && loading && (
        <div className="py-12 flex justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className={cn('text-4xl font-bold', scoreColor(data.summary.score))}>
                  {data.summary.score}
                </p>
                <p className="text-xs text-muted-foreground">/ 100</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Críticos</p>
                <p
                  className={cn(
                    'text-3xl font-bold',
                    data.summary.critical > 0
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {data.summary.critical}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Advertencias</p>
                <p
                  className={cn(
                    'text-3xl font-bold',
                    data.summary.warning > 0
                      ? 'text-amber-600'
                      : 'text-muted-foreground',
                  )}
                >
                  {data.summary.warning}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Info</p>
                <p className="text-3xl font-bold text-muted-foreground">
                  {data.summary.good}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Todo en orden. Sin issues detectadas.
                </p>
              ) : (
                data.issues.map((issue) => {
                  const cfg = severityConfig(issue.severity);
                  const Icon = cfg.icon;
                  const isExpanded = expanded.has(issue.id);
                  const canExpand = issue.samples.length > 0;
                  return (
                    <div
                      key={issue.id}
                      className={cn(
                        'border-l-2 rounded-md border',
                        cfg.borderClass,
                        cfg.bgClass,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => canExpand && toggle(issue.id)}
                        disabled={!canExpand}
                        className="w-full text-left p-3 flex items-start gap-3"
                      >
                        <Icon className={cn('size-5 flex-shrink-0 mt-0.5', cfg.colorClass)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">
                              {issue.title}
                              {issue.affectedCount > 0 && (
                                <span className="ml-2 text-sm text-muted-foreground">
                                  · {issue.affectedCount}{' '}
                                  {issue.affectedCount === 1 ? 'item' : 'items'}
                                </span>
                              )}
                            </p>
                            {canExpand && (
                              <ChevronDown
                                className={cn(
                                  'size-4 text-muted-foreground transition-transform',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {issue.description}
                          </p>
                        </div>
                      </button>
                      {isExpanded && issue.samples.length > 0 && (
                        <div className="border-t px-3 py-2 space-y-1 bg-background/60">
                          <p className="text-xs text-muted-foreground mb-2">
                            Primeros {issue.samples.length} afectados
                            {issue.affectedCount > issue.samples.length &&
                              ` (de ${issue.affectedCount} totales)`}
                            :
                          </p>
                          {issue.samples.map((s) => (
                            <Link
                              key={s.id}
                              href={s.editPath}
                              className="flex items-center gap-2 text-sm hover:underline py-1"
                            >
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                              {s.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Última auditoría: {new Date(data.summary.checkedAt).toLocaleString('es-CL')}
          </p>
        </>
      )}
    </div>
  );
}
