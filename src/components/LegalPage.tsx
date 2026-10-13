import type { ReactNode } from "react";

export function LegalPage({ title, family = false, children }: { title: string; family?: boolean; children: ReactNode }) {
  const home = family ? "/auth" : "/";
  const back = () => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back();
    else window.location.href = home;
  };
  const p = family ? "/family-privacidad" : "/privacidad";
  const t = family ? "/family-terminos" : "/terminos";
  return (
    <main className="min-h-screen bg-background p-5 text-foreground">
      <article className="mx-auto max-w-2xl space-y-4 text-lg leading-relaxed [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold">
        <button type="button" onClick={back} className="rounded-2xl bg-primary px-5 py-3 text-lg font-bold text-primary-foreground">← Volver</button>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="text-sm text-muted-foreground">Última actualización: octubre 2026</p>
        {children}
        <p className="pt-6 text-sm text-muted-foreground">
          <a className="underline" href={p}>Privacidad</a> · <a className="underline" href={t}>Términos de uso</a>
        </p>
      </article>
    </main>
  );
}

export const OWNER = "[NOMBRE DEL TITULAR] · NIF [NIF] · [DIRECCIÓN] · [EMAIL DE CONTACTO]";
