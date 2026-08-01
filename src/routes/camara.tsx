import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Mic, MicOff, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/camara")({
  head: () => ({
    meta: [
      { title: "Grannytools — Cámara de ayuda" },
      { name: "description", content: "Activa la cámara trasera o frontal con la voz para que quien te ayuda pueda ver lo que ves." },
      { property: "og:title", content: "Grannytools — Cámara de ayuda" },
      { property: "og:description", content: "Activa la cámara con la voz mientras hablas por teléfono." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CamaraAyuda,
});

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
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function CamaraAyuda() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [label, setLabel] = useState("");
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setLabel("");
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const openCamera = async (facing: "environment" | "user") => {
    stopCamera();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
      streamRef.current = s;
      setStream(s);
      setLabel(facing === "environment" ? "Cámara trasera" : "Cámara frontal");
      setError(null);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (e) {
      console.error(e);
      setError("No se pudo abrir la cámara.");
    }
  };

  const stopVoice = () => {
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    recogRef.current = null;
    setListening(false);
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
      setHint(txt);
      if (/(cerrar|apagar|quitar)/.test(txt)) { stopCamera(); return; }
      if (/(atr[aá]s|trasera|posterior)/.test(txt)) openCamera("environment");
      else if (/(delante|frontal|selfi|interior)/.test(txt)) openCamera("user");
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => { recogRef.current = null; setListening(false); };
    try {
      rec.start();
      recogRef.current = rec;
      setListening(true);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("No se pudo activar la escucha por voz.");
    }
  };

  useEffect(() => () => { stopVoice(); stopCamera(); }, []);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Camera className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Cámara de ayuda</h1>
        </header>

        <p className="mb-3 text-sm text-muted-foreground">
          Mientras hablas por teléfono, di <b>"cámara trasera"</b>, <b>"cámara frontal"</b> o <b>"cerrar cámara"</b>.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button onClick={() => openCamera("environment")} className="rounded-xl bg-secondary px-3 py-4 text-base font-bold text-secondary-foreground active:scale-[0.97] active:shadow-inner">
            Cámara trasera
          </button>
          <button onClick={() => openCamera("user")} className="rounded-xl bg-secondary px-3 py-4 text-base font-bold text-secondary-foreground active:scale-[0.97] active:shadow-inner">
            Cámara frontal
          </button>
        </div>

        <button
          onClick={listening ? stopVoice : startVoice}
          aria-pressed={listening}
          className={[
            "mb-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-4 text-base font-bold active:scale-[0.97] active:shadow-inner",
            listening ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground",
          ].join(" ")}
        >
          {listening ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
          {listening ? "Dejar de escuchar" : "Escuchar órdenes de voz"}
        </button>

        {hint && <p className="mb-3 text-xs text-muted-foreground">Última orden oída: "{hint}"</p>}

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {stream && (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{label} activada</div>
            <div className="overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "3 / 4" }}>
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            </div>
            <button onClick={stopCamera} className="mt-2 w-full rounded-xl bg-secondary px-3 py-3 text-base font-bold text-secondary-foreground active:scale-[0.97]">
              Cerrar cámara
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
