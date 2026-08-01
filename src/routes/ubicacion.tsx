import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, AlertTriangle, MessageCircle, Send } from "lucide-react";
import { type Contact, loadContacts, initials } from "@/lib/contacts";

export const Route = createFileRoute("/ubicacion")({
  head: () => ({
    meta: [
      { title: "Grannytools — Compartir ubicación" },
      { name: "description", content: "Envía tu ubicación exacta por mensaje o WhatsApp a uno de tus contactos de confianza." },
      { property: "og:title", content: "Grannytools — Compartir ubicación" },
      { property: "og:description", content: "Comparte dónde estás con un solo toque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ubicacion,
});

function Ubicacion() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState(0);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContacts(loadContacts());
  }, []);

  const getLink = async (): Promise<string | null> => {
    setError(null);
    if (!navigator.geolocation) {
      setError("Este móvil no permite obtener la ubicación.");
      return null;
    }
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }),
      );
      const { latitude, longitude } = pos.coords;
      const url = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      setLink(url);
      return url;
    } catch (e) {
      console.error(e);
      setError("No se pudo obtener la ubicación. Activa el GPS y permite el acceso.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sendBy = async (via: "sms" | "whatsapp") => {
    const c = contacts[selected];
    if (!c) {
      setError("Primero añade contactos en la pantalla de Contactos.");
      return;
    }
    const url = link ?? (await getLink());
    if (!url) return;
    const text = `Estoy aquí: ${url}`;
    const tel = c.phone.replace(/[^\d+]/g, "");
    if (via === "sms") {
      window.location.href = `sms:${tel}?&body=${encodeURIComponent(text)}`;
    } else {
      window.open(`https://wa.me/${tel.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MapPin className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Mi ubicación</h1>
        </header>

        <p className="mb-3 text-sm text-muted-foreground">Elige a quién quieres decirle dónde estás.</p>

        {contacts.length === 0 ? (
          <p className="rounded-xl bg-card p-3 text-sm text-muted-foreground shadow-sm">
            Todavía no hay contactos. Añádelos primero en la pantalla <b>Contactos</b>.
          </p>
        ) : (
          <div className="mb-4 grid grid-cols-3 gap-2">
            {contacts.map((c, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
                className={[
                  "overflow-hidden rounded-2xl shadow active:scale-[0.96] transition-all",
                  selected === i ? "ring-4 ring-primary" : "opacity-80",
                ].join(" ")}
              >
                <div className="relative aspect-square w-full bg-secondary">
                  {c.photo ? (
                    <img src={c.photo} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-black text-primary-foreground">
                      {initials(c.name)}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-1 text-center text-xs font-bold text-white">
                    {c.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-2">
          <button
            onClick={() => sendBy("whatsapp")}
            disabled={busy || contacts.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success px-3 py-5 text-lg font-black text-success-foreground shadow-lg active:scale-[0.98] active:shadow-inner disabled:opacity-50"
          >
            <MessageCircle className="h-6 w-6" aria-hidden />
            Enviar por WhatsApp
          </button>
          <button
            onClick={() => sendBy("sms")}
            disabled={busy || contacts.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-5 text-lg font-black text-primary-foreground shadow-lg active:scale-[0.98] active:shadow-inner disabled:opacity-50"
          >
            <Send className="h-6 w-6" aria-hidden />
            Enviar por mensaje
          </button>
        </div>

        {busy && <p className="mt-3 text-sm text-muted-foreground">Buscando tu ubicación…</p>}

        {link && (
          <p className="mt-3 break-all rounded-xl bg-card p-3 text-xs text-muted-foreground shadow-sm">
            Tu ubicación: <a href={link} target="_blank" rel="noreferrer" className="font-bold underline">{link}</a>
          </p>
        )}

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
