import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Users, Phone, PhoneCall, Trash2, Plus, VolumeX, Volume2, Settings, X, Mic, MicOff, Camera, AlertTriangle, User, Volume as VolumeIcon } from "lucide-react";

export const Route = createFileRoute("/panico")({
  head: () => ({
    meta: [
      { title: "Grammytools — Contactos de ayuda" },
      { name: "description", content: "Llama a tus contactos de confianza con un toque y activa alarma en caso de emergencia." },
      { property: "og:title", content: "Grammytools — Contactos" },
      { property: "og:description", content: "Pide ayuda con un solo toque." },
    ],
  }),
  component: Panico,
});

type Contact = { name: string; phone: string; photo?: string };
const CONTACTS_KEY = "grammytools.contacts";
const LEGACY_KEY = "yayoutil.panic.contacts";
const MAX_CONTACTS = 24;

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
    lfo.frequency.value = 3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500;
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

// ---- Voice recognition ---------------------------------------------------
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): { new (): SpeechRecognitionLike } | null {
  const w = window as unknown as { SpeechRecognition?: { new (): SpeechRecognitionLike }; webkitSpeechRecognition?: { new (): SpeechRecognitionLike } };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---- Contact photo capture -----------------------------------------------
async function capturePhoto(): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    // wait a bit for autoexposure
    await new Promise((r) => setTimeout(r, 400));
    const size = 320;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.min(vw, vh);
    const sx = (vw - s) / 2, sy = (vh - s) / 2;
    ctx.drawImage(video, sx, sy, s, s, 0, 0, size, size);
    stream.getTracks().forEach((t) => t.stop());
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch (e) {
    console.error(e);
    return null;
  }
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}

function Panico() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [alarmOn, setAlarmOn] = useState(false);
  const [callIndex, setCallIndex] = useState(0);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const sirenRef = useRef<SirenEngine>(new SirenEngine());
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTACTS_KEY) ?? localStorage.getItem(LEGACY_KEY);
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
    if (contacts.length >= MAX_CONTACTS) { setError(`Máximo ${MAX_CONTACTS} contactos.`); return; }
    saveContacts([...contacts, { name: n, phone: p, photo: newPhoto ?? undefined }]);
    setName(""); setPhone(""); setNewPhoto(null); setError(null);
  };

  const removeContact = (i: number) => saveContacts(contacts.filter((_, idx) => idx !== i));

  const takePhoto = async () => {
    setCapturing(true);
    const dataUrl = await capturePhoto();
    setCapturing(false);
    if (dataUrl) setNewPhoto(dataUrl);
    else setError("No se pudo hacer la foto.");
  };

  const retakePhotoFor = async (i: number) => {
    setCapturing(true);
    const dataUrl = await capturePhoto();
    setCapturing(false);
    if (dataUrl) {
      const next = contacts.slice();
      next[i] = { ...next[i], photo: dataUrl };
      saveContacts(next);
    }
  };

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

  const startVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) { setError("Este navegador no reconoce comandos de voz."); return; }
    const rec = new Ctor();
    rec.lang = "es-ES";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const txt = Array.from(ev.results).map((r) => r[0]?.transcript ?? "").join(" ").toLowerCase();
      setVoiceHint(txt);
      const wantsBack = /(atr[aá]s|trasera|posterior|de atr[aá]s)/.test(txt);
      const wantsFront = /(delante|frontal|selfi|interior|de delante)/.test(txt);
      const wantsBoth = /(ambas|dos c[aá]maras|todas)/.test(txt);
      const wantsClose = /(cerrar|apagar|quitar c[aá]mara)/.test(txt);
      if (wantsClose) { stopCamera(); return; }
      if (wantsBoth) { openCamera("environment"); return; }
      if (wantsBack) openCamera("environment");
      else if (wantsFront) openCamera("user");
    };
    rec.onerror = () => setVoiceListening(false);
    rec.onend = () => {
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

  const callContact = (c: Contact) => {
    // ";" y "," son pausas DTMF; algunos móviles interpretan sufijos especiales,
    // pero activar el altavoz por URL no está estandarizado. Se usa tel: y
    // se avisa al usuario para pulsar "altavoz" durante la llamada.
    window.location.href = `tel:${c.phone}`;
  };

  const triggerPanic = async () => {
    setError(null);
    if (contacts.length === 0) { setError("Añade primero un contacto."); return; }
    setAlarmOn(true);
    setCallIndex(0);
    try { await sirenRef.current.start(); } catch { /* ignore */ }
    try { navigator.vibrate?.([600, 200, 600, 200, 600]); } catch { /* ignore */ }
    callContact(contacts[0]);
  };

  const callNext = () => {
    const next = callIndex + 1;
    if (next < contacts.length) {
      setCallIndex(next);
      callContact(contacts[next]);
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
            <Users className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Contactos</h1>
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label="Editar contactos"
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
              "mb-3 flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-5 text-xl font-black shadow-lg select-none",
              "active:scale-[0.98] active:shadow-inner transition-all",
              "bg-destructive text-destructive-foreground",
              contacts.length === 0 ? "opacity-50" : "",
            ].join(" ")}
          >
            <AlertTriangle className="h-8 w-8" aria-hidden />
            PEDIR AYUDA
          </button>
        ) : (
          <div className="mb-3 rounded-2xl bg-destructive p-4 text-destructive-foreground shadow-lg">
            <div className="mb-2 flex items-center gap-2">
              <Volume2 className="h-6 w-6 animate-pulse" aria-hidden />
              <span className="text-lg font-black">ALARMA ACTIVADA</span>
            </div>
            <p className="mb-2 text-sm">
              Llamando a <b>{contacts[callIndex]?.name}</b> ({callIndex + 1}/{contacts.length})
            </p>
            <div className="mb-2 flex items-start gap-2 rounded-xl bg-white/15 p-2 text-sm">
              <VolumeIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>Pulsa <b>"Altavoz"</b> o <b>"Manos libres"</b> en la pantalla de llamada para hablar sin cogerlo.</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={callNext}
                disabled={callIndex + 1 >= contacts.length}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/20 px-3 py-3 text-base font-bold active:scale-[0.97] disabled:opacity-50"
              >
                <PhoneCall className="h-5 w-5" aria-hidden />
                Siguiente
              </button>
              <button
                onClick={stopAll}
                className="flex items-center justify-center gap-2 rounded-xl bg-white text-destructive px-3 py-3 text-base font-bold active:scale-[0.97]"
              >
                <VolumeX className="h-5 w-5" aria-hidden />
                Parar
              </button>
            </div>
          </div>
        )}

        {/* Contacts grid */}
        <section className="mb-3 rounded-2xl bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-bold">Mis contactos</h2>
            <span className="ml-auto text-xs text-muted-foreground">{contacts.length}/{MAX_CONTACTS}</span>
          </div>

          {contacts.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay contactos. Pulsa el engranaje arriba para añadirlos.
            </p>
          )}

          {contacts.length > 0 && (
            <div
              className="grid grid-cols-4 gap-2 overflow-y-auto pr-1"
              style={{ maxHeight: "calc(2 * (22vh + 0.5rem))" }}
            >
              {contacts.map((c, i) => (
                <div key={i} className="relative flex flex-col items-center">
                  <button
                    onClick={() => editing ? retakePhotoFor(i) : callContact(c)}
                    aria-label={editing ? `Cambiar foto de ${c.name}` : `Llamar a ${c.name}`}
                    className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary shadow active:scale-[0.96]"
                  >
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground text-2xl font-black">
                        {initials(c.name)}
                      </div>
                    )}
                    {!editing && (
                      <div className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Phone className="h-4 w-4" aria-hidden />
                      </div>
                    )}
                  </button>
                  <div className="mt-1 w-full truncate text-center text-xs font-bold" title={c.name}>{c.name}</div>
                  {editing && (
                    <button
                      onClick={() => removeContact(i)}
                      aria-label={`Borrar ${c.name}`}
                      className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow active:scale-[0.9]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {editing && contacts.length < MAX_CONTACTS && (
            <div className="mt-3 space-y-2 rounded-xl border-2 border-dashed border-border p-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={takePhoto}
                  disabled={capturing}
                  className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-secondary-foreground active:scale-[0.96]"
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
        </section>

        {/* Remote-help camera panel */}
        <section className="mb-3 rounded-2xl bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-base font-bold">Cámara para quien te ayuda</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Cuando estés al teléfono, activa la escucha por voz y di <b>"cámara trasera"</b>, <b>"cámara frontal"</b> o <b>"cerrar cámara"</b>.
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

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <p className="rounded-xl bg-card p-3 text-xs text-muted-foreground shadow-sm">
          Aviso: en emergencias graves llama tú mismo al <b>112</b>. Los navegadores no pueden activar el <b>manos libres</b> automáticamente; púlsalo en la pantalla de llamada del móvil.
        </p>
      </div>
    </main>
  );
}
