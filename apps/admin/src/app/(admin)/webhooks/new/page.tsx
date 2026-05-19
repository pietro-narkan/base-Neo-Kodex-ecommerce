import { WebhookForm } from '@/components/forms/webhook-form';

export default function NewWebhookPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo webhook</h1>
        <p className="text-sm text-muted-foreground">
          Configurá una URL externa que reciba notificaciones de eventos del sistema.
        </p>
      </div>
      <WebhookForm />
    </div>
  );
}
