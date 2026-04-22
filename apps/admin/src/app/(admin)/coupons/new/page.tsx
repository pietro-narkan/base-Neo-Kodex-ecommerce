import { CouponForm } from '@/components/forms/coupon-form';

export default function NewCouponPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo cupón</h1>
        <p className="text-sm text-muted-foreground">
          Creá un cupón de descuento para aplicar en el checkout.
        </p>
      </div>
      <CouponForm />
    </div>
  );
}
