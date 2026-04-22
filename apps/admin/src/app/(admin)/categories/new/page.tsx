import { CategoryForm } from '@/components/forms/category-form';

export default function NewCategoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nueva categoría
        </h1>
        <p className="text-sm text-muted-foreground">
          Creá una nueva categoría para organizar los productos.
        </p>
      </div>
      <CategoryForm />
    </div>
  );
}
