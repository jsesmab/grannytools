import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft } from "lucide-react";
import { getLinkCode, getLinkedFamily, linkPayload, LINK_EVT, unlink } from "@/lib/family-link";

export const Route = createFileRoute("/vincular")({
  head: () => ({
    meta: [
      { title: "Vincular con un familiar — Grannytools" },
      { name: "description", content: "Muestra un código QR para que un familiar gestione Grannytools desde la app Family." },
      { property: "og:title", content: "Vincular con un familiar — Grannytools" },
      { property: "og:description", content: "Código QR para conectar con Grannytools Family." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Vincular,
});

function Vincular() {
  const [state, setState] = useState<{ payload: string; code: string; family: ReturnType<typeof getLinkedFamily> } | null>(null);
  const refresh = () => setState({ payload: linkPayload(), code: getLinkCode(), family: getLinkedFamily() });
  useEffect(() => {
    refresh();
    window.addEventListener(LINK_EVT, refresh);
    return () => window.removeEventListener(LINK_EVT, refresh);
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background p-4 text-foreground">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/" aria-label="Volver" className="rounded-2xl bg-secondary p-3 text-secondary-foreground">
          <ArrowLeft className="h-7 w-7" />
        </Link>
        <h1 className="text-2xl font-extrabold">Vincular con un familiar</h1>
      </header>
      {state && (
        <div className="space-y-4 text-center">
          {state.family ? (
            <p className="rounded-2xl bg-success p-4 text-xl font-bold text-success-foreground">
              Vinculado con {state.family.name}
            </p>
          ) : (
            <p className="text-lg font-semibold">
              Pide a tu familiar que abra <b>Grannytools Family</b> y enfoque este dibujo con su cámara.
            </p>
          )}
          <div className="mx-auto w-fit rounded-3xl border-4 border-foreground bg-card p-4">
            <QRCodeSVG value={state.payload} size={240} bgColor="transparent" fgColor="currentColor" level="M" />
          </div>
          <p className="text-sm font-bold text-muted-foreground">O que escriba este código:</p>
          <p className="text-4xl font-black tracking-widest">{state.code}</p>
          {state.family ? (
            <button onClick={() => { if (confirm("¿Desvincular a tu familiar?")) unlink(); }} className="w-full rounded-2xl bg-destructive py-4 text-xl font-bold text-destructive-foreground">
              Desvincular
            </button>
          ) : (
            <button onClick={() => { getLinkCode(true); refresh(); }} className="w-full rounded-2xl bg-secondary py-4 text-lg font-bold text-secondary-foreground">
              Generar código nuevo
            </button>
          )}
          <p className="text-xs text-muted-foreground">Funciona sin internet; los cambios del familiar llegarán cuando haya conexión.</p>
        </div>
      )}
    </main>
  );
}
