import type { ReactNode } from "react";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-5 text-foreground">
      <article className="mx-auto max-w-2xl space-y-4 text-lg leading-relaxed [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold">
        <a href="javascript:history.back()" className="font-bold text-primary underline">← Volver</a>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-sm text-muted-foreground">Última actualización: octubre 2026</p>
        {children}
        <p className="pt-6 text-sm text-muted-foreground">
          <a className="underline" href="/privacidad">Privacidad</a> · <a className="underline" href="/terminos">Términos de uso</a>
        </p>
      </article>
    </main>
  );
}

export const OWNER = "[NOMBRE DEL TITULAR] · NIF [NIF] · [DIRECCIÓN] · [EMAIL DE CONTACTO]";
