export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-12">
      <div className="container mx-auto px-4 py-8 text-sm text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} Neo-Kodex. Todos los derechos
            reservados.
          </span>
          <span className="text-xs">
            Base estándar · Powered by Neo-Kodex Ecommerce
          </span>
        </div>
      </div>
    </footer>
  );
}
