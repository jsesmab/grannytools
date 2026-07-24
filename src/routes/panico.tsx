import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AlertTriangle, Phone, PhoneCall, Trash2, Plus, VolumeX, Volume2, Settings, X, Mic, MicOff, Camera } from "lucide-react";

export const Route = createFileRoute("/panico")({
  head: () => ({
    meta: [
      { title: "Yayoutil — Botón de pánico" },
      { name: "description", content: "Activa una alarma sonora y llama en orden a tus contactos de confianza en caso de emergencia." },
      { property: "og:title", content: "Yayoutil — Botón de pánico" },
      { property: "og:description", content: "Pide ayuda con un solo toque." },
    ],
  }),
  component: Panico,
});

type Contact = { name: string; phone: string };
const CONTACTS_KEY = "yayoutil.panic.contacts";

// ---- Alarm engine (Web Audio siren) --------------------------------------
class SirenEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  async start() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 700;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3; // wail speed
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500; // wail depth
    lfo.connect(lfoGain).connect(osc.frequency);

    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    osc.connect(gain).connect(ctx.destination);

    osc.start(); lfo.start();
    this.ctx = ctx; this.osc = osc; this.gain = gain; this.lfo = lfo; this.lfoGain = lfoGain;
  }

  async stop() {
    try { this.osc?.stop(); } catch { /* ignore */ }
    try { this.lfo?.stop(); } catch { /* ignore */ }
    try { await this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null; this.osc = null; this.gain = null; this.lfo = null; this.lfoGain = null;
  }
}

// ---- Voice-controlled camera ---------------------------------------------
type SR = typeof window extends { SpeechRecognition: infer T } ? T : never;

function getSpeechRecognition(): { new (): SpeechRecognition } | null {
  const w = window as unknown as { SpeechRecognition?: { new (): SpeechRecognition }; webkitSpeechRecognition?: { new (): SpeechRecognition } };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function Panico() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);

  const [alarmOn, setAlarmOn] = useState(false);
  const [callIndex, setCallIndex] = useState(0);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const sirenRef = useRef<SirenEngine>(new SirenEngine());
  const recogRef = useRef<SpeechRecognition | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load contacts
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTACTS_KEY);
      if (raw) setContacts(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveContacts = (next: Contact[]) => {
    setContacts(next);
    try { localStorage.setItem(CONTACTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const addContact = () => {
    const n = name.trim(); const p = phone.trim();
    if (!n || !p) { setError("Escribe nombre y teléfono."); return; }
    if (contacts.length >= 3) { setError("Máximo 3 contactos."); return; }
    saveContacts([...contacts, { name: n, phone: p }]);
    setName(""); setPhone(""); setError(null);
  };

  const removeContact = (i: number) => saveContacts(contacts.filter((_, idx) => idx !== i));

  const attachStream = (s: MediaStream | null) => {
    if (videoRef.current) videoRef.current.srcObject = s;
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setCameraLabel("");
    attachStream(null);
  };

  const openCamera = async (facing: "environment" | "user") => {
    stopCamera();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      setCameraStream(s);
      setCameraLabel(facing === "environment" ? "Cámara trasera" : "Cámara frontal");
      setTimeout(() => {
        attachStream(s);
        videoRef.current?.play().catch(() => {});
      }, 50);
    } catch (e) {
      console.error(e);
      setError("No se pudo abrir la cámara.");
    }
  };

  // ---- Voice recognition -------------------------------------------------
  const startVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) { setError("Este navegador no reconoce comandos de voz."); return; }
    const rec = new Ctor();
    rec.lang = "es-ES";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const txt = Array.from(ev.results).map((r) => r[0]?.transcript ?? "").join(" ").toLowerCase();
      setVoiceHint(txt);
      // very tolerant matching
      const wantsBack = /(atr[aá]s|trasera|posterior|de atr[aá]s)/.test(txt);
      const wantsFront = /(delante|frontal|selfi|interior|de delante)/.test(txt);
      const wantsBoth = /(ambas|dos c[aá]maras|todas)/.test(txt);
      const wantsClose = /(cerrar|apagar|quitar c[aá]mara)/.test(txt);
      if (wantsClose) { stopCamera(); return; }
      if (wantsBoth) {
        // best effort: open back (frontal not supported simultaneously on web)
        openCamera("environment");
        return;
      }
      if (wantsBack) openCamera("environment");
      else if (wantsFront) openCamera("user");
    };
    rec.onerror = () => setVoiceListening(false);
    rec.onend = () => {
      // auto-restart while listening
      if (recogRef.current === rec && voiceListening) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    try {
      rec.start();
      recogRef.current = rec;
      setVoiceListening(true);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("No se pudo activar la escucha por voz.");
    }
  };

  const stopVoice = () => {
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    recogRef.current = null;
    setVoiceListening(false);
  };

  // ---- Panic action ------------------------------------------------------
  const triggerPanic = async () => {
    setError(null);
    setAlarmOn(true);
    setCallIndex(0);
    try { await sirenRef.current.start(); } catch { /* ignore */ }
    // Vibrate SOS
    try { navigator.vibrate?.([600, 200, 600, 200, 600]); } catch { /* ignore */ }
    // Call first contact
    if (contacts[0]) window.location.href = `tel:${contacts[0].phone}`;
  };

  const callNext = () => {
    const next = callIndex + 1;
    if (next < contacts.length) {
      setCallIndex(next);
      window.location.href = `tel:${contacts[next].phone}`;
    } else {
      setError("Ya se llamó a todos los contactos.");
    }
  };

  const stopAll = async () => {
    setAlarmOn(false);
    await sirenRef.current.stop();
    stopVoice();
    stopCamera();
    try { navigator.vibrate?.(0); } catch { /* ignore */ }
  };

  useEffect(() => () => { sirenRef.current.stop(); stopVoice(); stopCamera(); }, []);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Pánico</h1>
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label="Configurar contactos"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]"
          >
            {editing ? <X className="h-5 w-5" aria-hidden /> : <Settings className="h-5 w-5" aria-hidden />}
          </button>
        </header>

        {!alarmOn ? (
          <button
            onClick={triggerPanic}
            disabled={contacts.length === 0}
            className={[
              "mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-3xl px-4 py-10 text-2xl font-black shadow-lg select-none",
              "active:scale-[0.98] active:shadow-inner transition-all",
              "bg-destructive text-destructive-foreground",
              contacts.length === 0 ? "opacity-50" : "",
            ].join(" ")}
          >
            <AlertTriangle className="h-14 w-14" aria-hidden />
            PEDIR AYUDA
            <span className="text-sm font-semibold opacity-90">
              {contacts.length === 0 ? "Añade primero un contacto" : `Llama a ${contacts[0]?.name}`}
            </span>
          </button>
        ) : (
          <div className="mb-4 rounded-3xl bg-destructive p-4 text-destructive-foreground shadow-lg">
            <div className="mb-3 flex items-center gap-2">
              <Volume2 className="h-6 w-6 animate-pulse" aria-hidden />
              <span className="text-lg font-black">ALARMA ACTIVADA</span>
            </div>
            <p className="mb-3 text-sm">
              Llamando a <b>{contacts[callIndex]?.name}</b> ({callIndex + 1}/{contacts.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={callNext}
                disabled={callIndex + 1 >= contacts.length}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/20 px-3 py-3 text-base font-bold active:scale-[0.97] disabled:opacity-50"
              >
                <PhoneCall className="h-5 w-5" aria-hidden />
                Siguiente contacto
              </button>
              <button
                onClick={stopAll}
                className="flex items-center justify-center gap-2 rounded-xl bg-white text-destructive px-3 py-3 text-base font-bold active:scale-[0.97]"
              >
                <VolumeX className="h-5 w-5" aria-hidden />
                Parar alarma
              </button>
            </div>
          </div>
        )}

        {/* Remote-help camera panel */}
        <section className="mb-3 rounded-2xl bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-bold">Cámara para quien te ayuda</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Cuando estés al teléfono, activa la escucha por voz. Di <b>"cámara trasera"</b>, <b>"cámara frontal"</b> o <b>"cerrar cámara"</b> y se abrirá en tu móvil para que la persona que te ayuda pueda verte.
          </p>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => openCamera("environment")}
              className="rounded-xl bg-secondary px-3 py-3 text-base font-bold text-secondary-foreground active:scale-[0.97]"
            >
              Cámara trasera
            </button>
            <button
              onClick={() => openCamera("user")}
              className="rounded-xl bg-secondary px-3 py-3 text-base font-bold text-secondary-foreground active:scale-[0.97]"
            >
              Cámara frontal
            </button>
          </div>

          <button
            onClick={voiceListening ? stopVoice : startVoice}
            aria-pressed={voiceListening}
            className={[
              "mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-bold active:scale-[0.97]",
              voiceListening ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground",
            ].join(" ")}
          >
            {voiceListening ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
            {voiceListening ? "Escuchando... (tocar para parar)" : "Escuchar comandos de voz"}
          </button>

          {voiceHint && (
            <p className="mb-2 text-xs text-muted-foreground">Última orden oída: "{voiceHint}"</p>
          )}

          {cameraStream && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-muted-foreground">{cameraLabel} activada</div>
              <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "3 / 4" }}>
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              </div>
              <button onClick={stopCamera} className="mt-2 w-full rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground active:scale-[0.97]">
                Cerrar cámara
              </button>
            </div>
          )}
        </section>

        {/* Contacts */}
        <section className="mb-3 rounded-2xl bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-bold">Contactos de ayuda (hasta 3)</h2>
          </div>

          {contacts.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay contactos. Pulsa el engranaje arriba para añadirlos.
            </p>
          )}

          <ul className="space-y-2">
            {contacts.map((c, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl border-2 border-border p-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">{c.name}</div>
                  <div className="truncate text-sm text-muted-foreground">{c.phone}</div>
                </div>
                {editing ? (
                  <button onClick={() => removeContact(i)} aria-label={`Borrar ${c.name}`} className="rounded-lg bg-destructive/10 p-2 text-destructive active:scale-[0.95]">
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </button>
                ) : (
                  <a href={`tel:${c.phone}`} aria-label={`Llamar a ${c.name}`} className="rounded-lg bg-primary p-2 text-primary-foreground active:scale-[0.95]">
                    <Phone className="h-5 w-5" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>

          {editing && contacts.length < 3 && (
            <div className="mt-3 space-y-2 rounded-xl border-2 border-dashed border-border p-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre (p. ej. Marta)"
                className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Teléfono (con prefijo, p. ej. +34600000000)"
                className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
              />
              <button onClick={addContact} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-base font-bold text-primary-foreground active:scale-[0.97]">
                <Plus className="h-5 w-5" aria-hidden />
                Añadir contacto
              </button>
            </div>
          )}
        </section>

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <p className="rounded-xl bg-card p-3 text-xs text-muted-foreground shadow-sm">
          Aviso: en emergencias graves llama tú mismo al <b>112</b>. Esta app avisa a tus contactos de confianza; no sustituye a los servicios de emergencia. La escucha por voz depende del navegador (Chrome en Android funciona mejor).
        </p>
      </div>
    </main>
  );
}
