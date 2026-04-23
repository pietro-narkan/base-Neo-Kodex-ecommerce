'use client';

import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderTimeline } from '@/components/order-timeline';
import { api, apiDelete, apiGet, apiPatch } from '@/lib/api';
import { formatCLP, formatDate } from '@/lib/utils';

type OrderStatus = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
type DocumentType = 'NONE' | 'BOLETA' | 'FACTURA';

interface Address {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  country: string;
}

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  priceGross: number;
  subtotal: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  documentType: DocumentType;
  documentFolio: string | null;
  documentNumber: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  rut: string | null;
  subtotalNet: number;
  subtotalGross: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  couponCode: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  shippingProvider: string | null;
  trackingNumber: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  items: OrderItem[];
  notes: string | null;
  createdAt: string;
}

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  FULFILLED: 'Despachada',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

const statusVariant: Record<OrderStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  PAID: 'success',
  FULFILLED: 'default',
  CANCELLED: 'secondary',
  REFUNDED: 'destructive',
};

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLED', 'REFUNDED', 'CANCELLED'],
  FULFILLED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Inline-edit state for items: map of itemId → new qty being edited
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(1);

  const load = useCallback(() => {
    apiGet<Order>(`/admin/orders/${id}`)
      .then(setOrder)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChangeStatus(next: OrderStatus) {
    if (!window.confirm(`¿Marcar orden como ${statusLabels[next].toLowerCase()}?`)) return;
    setUpdating(true);
    setError(null);
    try {
      await apiPatch(`/admin/orders/${id}/status`, { status: next });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  async function handleSaveQty(itemId: string) {
    setUpdating(true);
    setError(null);
    try {
      await apiPatch(`/admin/orders/${id}/items/${itemId}`, { quantity: editQty });
      setEditingItem(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  async function handleRemoveItem(item: OrderItem) {
    if (!window.confirm(`¿Quitar "${item.productName}" de la orden? Se restaura stock.`)) return;
    setUpdating(true);
    setError(null);
    try {
      await apiDelete(`/admin/orders/${id}/items/${item.id}`);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  if (error && !order) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allowed = transitions[order.status];
  const canEditItems = order.status !== 'REFUNDED'; // allow edits on everything else incl cancelled

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Volver a órdenes
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {order.orderNumber}
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={statusVariant[order.status]}>
              {statusLabels[order.status]}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Pago: {order.paymentStatus}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
          </div>
        </div>
        {allowed.length > 0 && (
          <div className="flex gap-2">
            {allowed.map((s) => (
              <Button
                key={s}
                variant={s === 'CANCELLED' || s === 'REFUNDED' ? 'destructive' : 'default'}
                size="sm"
                disabled={updating}
                onClick={() => handleChangeStatus(s)}
              >
                Marcar como {statusLabels[s].toLowerCase()}
              </Button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  {canEditItems && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.productName}</div>
                      {item.variantName && (
                        <div className="text-xs text-muted-foreground">
                          {item.variantName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.sku}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingItem === item.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            min={1}
                            value={editQty}
                            onChange={(e) => setEditQty(Number(e.target.value))}
                            className="w-16 text-right"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSaveQty(item.id)}
                            disabled={updating}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingItem(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        item.quantity
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCLP(item.priceGross)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCLP(item.priceGross * item.quantity)}
                    </TableCell>
                    {canEditItems && editingItem !== item.id && (
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingItem(item.id);
                              setEditQty(item.quantity);
                            }}
                            title="Editar cantidad"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRemoveItem(item)}
                            title="Quitar de la orden"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal neto</span>
              <span>{formatCLP(order.subtotalNet)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>IVA</span>
              <span>{formatCLP(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal (con IVA)</span>
              <span>{formatCLP(order.subtotalGross)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>
                  Descuento
                  {order.couponCode && (
                    <span className="font-mono text-xs ml-1">({order.couponCode})</span>
                  )}
                </span>
                <span>-{formatCLP(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Envío</span>
              <span>{formatCLP(order.shippingAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t pt-2 mt-2">
              <span>Total</span>
              <span>{formatCLP(order.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Nombre:</span> {order.firstName}{' '}
              {order.lastName}
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span> {order.email}
            </div>
            {order.phone && (
              <div>
                <span className="text-muted-foreground">Teléfono:</span> {order.phone}
              </div>
            )}
            {order.rut && (
              <div>
                <span className="text-muted-foreground">RUT:</span> {order.rut}
              </div>
            )}
          </CardContent>
        </Card>

        <AddressEditor
          orderId={id}
          shipping={order.shippingAddress}
          billing={order.billingAddress}
          onSaved={load}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pago y envío</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Proveedor pago:</span>{' '}
              {order.paymentProvider ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Referencia:</span>{' '}
              <span className="font-mono text-xs">{order.paymentReference ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Proveedor envío:</span>{' '}
              {order.shippingProvider ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Tracking:</span>{' '}
              {order.trackingNumber ?? '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DTE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Tipo:</span>{' '}
              {order.documentType === 'NONE' ? '—' : order.documentType}
            </div>
            {order.documentFolio && (
              <div>
                <span className="text-muted-foreground">Folio:</span>{' '}
                <span className="font-mono text-xs">{order.documentFolio}</span>
              </div>
            )}
            {order.documentNumber && (
              <div>
                <span className="text-muted-foreground">N°:</span>{' '}
                <span className="font-mono text-xs">{order.documentNumber}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas del cliente (checkout)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      <OrderTimeline orderId={id} />
    </div>
  );
}

function AddressEditor({
  orderId,
  shipping,
  billing,
  onSaved,
}: {
  orderId: string;
  shipping: Address | null;
  billing: Address | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<'shipping' | 'billing' | null>(null);
  const [form, setForm] = useState<Address | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(kind: 'shipping' | 'billing', addr: Address | null) {
    setEditing(kind);
    setForm(
      addr ?? {
        id: '',
        firstName: '',
        lastName: '',
        phone: null,
        line1: '',
        line2: null,
        city: '',
        region: '',
        postalCode: null,
        country: 'CL',
      },
    );
    setError(null);
  }

  async function save() {
    if (!form || !editing) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/orders/${orderId}/address`, {
        method: 'PATCH',
        body: {
          kind: editing,
          address: {
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone ?? undefined,
            line1: form.line1,
            line2: form.line2 ?? undefined,
            city: form.city,
            region: form.region,
            postalCode: form.postalCode ?? undefined,
            country: form.country,
          },
        },
      });
      setEditing(null);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Direcciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && form ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Editar dirección de {editing === 'shipping' ? 'envío' : 'facturación'}
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-2">
              <FormField
                label="Nombre"
                value={form.firstName}
                onChange={(v) => setForm({ ...form, firstName: v })}
              />
              <FormField
                label="Apellido"
                value={form.lastName}
                onChange={(v) => setForm({ ...form, lastName: v })}
              />
            </div>
            <FormField
              label="Línea 1"
              value={form.line1}
              onChange={(v) => setForm({ ...form, line1: v })}
            />
            <FormField
              label="Línea 2 (opcional)"
              value={form.line2 ?? ''}
              onChange={(v) => setForm({ ...form, line2: v || null })}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                label="Ciudad"
                value={form.city}
                onChange={(v) => setForm({ ...form, city: v })}
              />
              <FormField
                label="Región"
                value={form.region}
                onChange={(v) => setForm({ ...form, region: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                label="Teléfono"
                value={form.phone ?? ''}
                onChange={(v) => setForm({ ...form, phone: v || null })}
              />
              <FormField
                label="Código postal"
                value={form.postalCode ?? ''}
                onChange={(v) => setForm({ ...form, postalCode: v || null })}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <AddressBlock
              title="Envío"
              address={shipping}
              onEdit={() => startEdit('shipping', shipping)}
            />
            {billing && billing.id !== shipping?.id && (
              <AddressBlock
                title="Facturación"
                address={billing}
                onEdit={() => startEdit('billing', billing)}
              />
            )}
            {!billing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEdit('billing', null)}
              >
                + Agregar dirección de facturación
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AddressBlock({
  title,
  address,
  onEdit,
}: {
  title: string;
  address: Address | null;
  onEdit: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Editar
        </Button>
      </div>
      {address ? (
        <div className="text-sm">
          <div>
            {address.firstName} {address.lastName}
            {address.phone && <> · {address.phone}</>}
          </div>
          <div className="text-muted-foreground">
            {address.line1}
            {address.line2 && <>, {address.line2}</>}
            <br />
            {address.city}, {address.region}
            {address.postalCode && <> · {address.postalCode}</>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
