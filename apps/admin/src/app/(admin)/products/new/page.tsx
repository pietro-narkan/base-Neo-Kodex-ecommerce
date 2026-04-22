import { ProductForm } from '@/components/forms/product-form';

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nuevo producto
        </h1>
        <p className="text-sm text-muted-foreground">
          Creá el producto. Las variantes (SKU, precio, stock) y las imágenes se agregan después.
        </p>
      </div>
      <ProductForm />
    </div>
  );
}
