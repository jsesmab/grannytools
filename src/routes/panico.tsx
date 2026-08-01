import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Users, Phone, Trash2, Plus, Settings, X, Camera, AlertTriangle, Siren, VolumeX } from "lucide-react";
import {
  type Contact,
  MAX_CONTACTS,
  loadContacts,
  saveContactsToStorage,
  initials,
  capturePhoto,
  callPhone,
} from "@/lib/contacts";

export const Route = createFileRoute("/panico")({
  head: () => ({
    meta: [
      { title: "Grannytools — Contactos de ayuda" },
      { name: "description", content: "Llama a tus contactos de confianza con un solo toque, con fotos grandes y fáciles de reconocer." },
      { property: "og:title", content: "Grannytools — Contactos" },
      { property: "og:description", content: "Llama a quien te ayuda con un solo toque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contactos,
});

class SirenEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;

  async start() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500;
    lfo.connect(lfoGain).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    lfo.start();
    this.ctx = ctx;
    this.osc = osc;
    this.lfo = lfo;
  }

  async stop() {
    try { this.osc?.stop(); } catch { /* ignore */ }
    try { this.lfo?.stop(); } catch { /* ignore */ }
    try { await this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null; this.osc = null; this.lfo = null;
  }
}

function Contactos() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sirenRef = useRef<SirenEngine>(new SirenEngine());

  useEffect(() => {
    setContacts(loadContacts());
    return () => { sirenRef.current.stop(); };
  }, []);

  const save = (next: Contact[]) => {
    setContacts(next);
    saveContactsToStorage(next);
  };

  const addContact = () => {
    const n = name.trim();
    const p = phone.trim();
    if (!n || !p) { setError("Escribe nombre y teléfono."); return; }
    if (contacts.length >= MAX_CONTACTS) { setError(`Máximo ${MAX_CONTACTS} contactos.`); return; }
    save([...contacts, { name: n, phone: p, photo: newPhoto ?? undefined }]);
    setName(""); setPhone(""); setNewPhoto(null); setError(null);
  };

  const takePhoto = async () => {
    setCapturing(true);
    const d = await capturePhoto("user");
    setCapturing(false);
    if (d) setNewPhoto(d);
    else setError("No se pudo hacer la foto.");
  };

  const retakePhotoFor = async (i: number) => {
    setCapturing(true);
    const d = await capturePhoto("user");
    setCapturing(false);
    if (!d) return;
    const next = contacts.slice();
    next[i] = { ...next[i], photo: d };
    save(next);
  };

  const toggleAlarm = async () => {
    if (alarmOn) {
      await sirenRef.current.stop();
      try { navigator.vibrate?.(0); } catch { /* ignore */ }
      setAlarmOn(false);
    } else {
      try { await sirenRef.current.start(); } catch { /* ignore */ }
      try { navigator.vibrate?.([600, 200, 600, 200, 600]); } catch { /* ignore */ }
      setAlarmOn(true);
    }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
            <Users className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Contactos</h1>
          <button
            onClick={toggleAlarm}
            aria-pressed={alarmOn}
            aria-label={alarmOn ? "Parar alarma" : "Activar alarma"}
            className={[
              "ml-auto flex h-10 w-10 items-center justify-center rounded-xl active:scale-[0.95]",
              alarmOn ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-secondary text-secondary-foreground",
            ].join(" ")}
          >
            {alarmOn ? <VolumeX className="h-5 w-5" aria-hidden /> : <Siren className="h-5 w-5" aria-hidden />}
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label="Editar contactos"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]"
          >
            {editing ? <X className="h-5 w-5" aria-hidden /> : <Settings className="h-5 w-5" aria-hidden />}
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {contacts.length === 0 && !editing && (
          <p className="rounded-xl bg-card p-3 text-sm text-muted-foreground shadow-sm">
            Todavía no hay contactos. Pulsa el engranaje de arriba para añadirlos.
          </p>
        )}

        {contacts.length > 0 && (
          <div className="grid flex-1 grid-cols-2 grid-rows-4 gap-2 overflow-y-auto">
            {contacts.map((c, i) => (
              <div key={i} className="relative min-h-[18vh]">
                <button
                  onClick={() => (editing ? retakePhotoFor(i) : callPhone(c.phone))}
                  aria-label={editing ? `Cambiar foto de ${c.name}` : `Llamar a ${c.name}`}
                  className="relative h-full w-full overflow-hidden rounded-2xl bg-secondary shadow-lg active:scale-[0.97] active:shadow-inner transition-all"
                >
                  {c.photo ? (
                    <img src={c.photo} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary text-4xl font-black text-primary-foreground">
                      {initials(c.name)}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/55 px-2 py-1.5">
                    <Phone className="h-4 w-4 shrink-0 text-white" aria-hidden />
                    <span className="truncate text-base font-black text-white">{c.name}</span>
                  </div>
                </button>
                {editing && (
                  <button
                    onClick={() => save(contacts.filter((_, idx) => idx !== i))}
                    aria-label={`Borrar ${c.name}`}
                    className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow active:scale-[0.9]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {editing && contacts.length < MAX_CONTACTS && (
          <div className="mt-3 space-y-2 rounded-2xl border-2 border-dashed border-border p-2">
            <div className="flex items-center gap-3">
              <button
                onClick={takePhoto}
                disabled={capturing}
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-secondary-foreground active:scale-[0.96]"
                aria-label="Hacer foto del contacto"
              >
                {newPhoto ? (
                  <img src={newPhoto} alt="Foto" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-xs font-bold">
                    <Camera className="h-6 w-6" aria-hidden />
                    Foto
                  </div>
                )}
              </button>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre"
                  className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Teléfono (+34...)"
                  className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
                />
              </div>
            </div>
            <button onClick={addContact} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-base font-bold text-primary-foreground active:scale-[0.97]">
              <Plus className="h-5 w-5" aria-hidden />
              Añadir contacto
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
