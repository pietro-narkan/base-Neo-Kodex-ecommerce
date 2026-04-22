import { AttributeForm } from '@/components/forms/attribute-form';

export default function NewAttributePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nuevo atributo
        </h1>
        <p className="text-sm text-muted-foreground">
          Creá el atributo y después agregá sus valores.
        </p>
      </div>
      <AttributeForm />
    </div>
  );
}
