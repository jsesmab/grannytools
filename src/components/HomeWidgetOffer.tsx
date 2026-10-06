import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestHomeWidget, widgetPlatform } from "@/lib/home-widget";

export function HomeWidgetOffer() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [skipped, setSkipped] = useState(false);

  async function add() {
    setBusy(true);
    setSkipped(false);
    const platform = widgetPlatform();
    if (platform === "web") {
      setMessage("El widget está disponible en la aplicación de tiendas. En el navegador puedes añadir Grannytools a la pantalla de inicio desde el menú del navegador.");
    } else if (platform === "ios") {
      setMessage("Mantén pulsada la pantalla de inicio, toca Editar y Añadir widget, busca Grannytools y elige el tamaño grande.");
    } else {
      const result = await requestHomeWidget();
      setMessage(result === "requested"
        ? "Confirma «Añadir» en la ventana del móvil. Si no aparece, mantén pulsada la pantalla de inicio y busca Grannytools en Widgets."
        : result === "unsupported"
          ? "Mantén pulsada la pantalla de inicio, abre Widgets y busca Grannytools. El tamaño depende de tu móvil."
          : "No se pudo abrir la solicitud. Puedes volver a intentarlo o buscar Grannytools en Widgets desde la pantalla de inicio.");
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="widget-title" className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <img src="/icon-192.png" alt="" width={72} height={72} className="size-16 shrink-0 rounded-xl" />
        <h2 id="widget-title" className="text-xl font-bold">¿Quieres un icono gigante de Grannytools?</h2>
      </div>
      <p>Un único icono grande, de tamaño 4 × 4, para abrir Grannytools desde la pantalla de inicio.</p>
      <Button className="h-auto w-full whitespace-normal rounded-2xl py-4 text-xl font-bold" disabled={busy} onClick={add}>
        {busy ? "Abriendo…" : "Añadir icono gigante"}
      </Button>
      <Button variant="secondary" className="h-auto w-full whitespace-normal py-3 text-lg" onClick={() => { setSkipped(true); setMessage(""); }}>Ahora no</Button>
      <p role="status" aria-live="polite" className="text-base">{skipped ? "Puedes seguir sin añadirlo." : message}</p>
    </section>
  );
}