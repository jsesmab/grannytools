import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, Lightbulb, LightbulbOff, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/lupa")({
  head: () => ({
    meta: [
      { title: "Grannytools — Lupa" },
      { name: "description", content: "Usa la cámara del móvil como lupa para leer letra pequeña, etiquetas y documentos." },
      { property: "og:title", content: "Grannytools — Lupa" },
      { property: "og:description", content: "Amplía lo que quieras leer con la cámara de tu móvil." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Lupa,
});

type TrackWithTorch = MediaStreamTrack & {
  applyConstraints: (c: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean; focusMode?: string }> }) => Promise<void>;
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
};

type ImageCaptureLike = { grabFrame: () => Promise<ImageBitmap> };

function Lupa() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0] as TrackWithTorch;
      const caps = track.getCapabilities?.();
      setTorchAvailable(Boolean(caps?.torch));
      // Enfoque continuo para que la imagen congelada salga nítida
      if (caps?.focusMode?.includes("continuous")) {
        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { /* ignore */ }
      }
      setRunning(true);
    } catch (e) {
      console.error(e);
      setError("No se pudo abrir la cámara. Permite el acceso en tu navegador.");
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  };

  // Encender la lupa automáticamente al entrar
  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as TrackWithTorch | undefined;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (e) {
      console.warn("torch failed", e);
      setError("Esta cámara no permite encender la linterna.");
    }
  };

  const freeze = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    const track = streamRef.current?.getVideoTracks()[0] as TrackWithTorch | undefined;
    if (!v || !c || !track) return;
    setBusy(true);
    try {
      // Pequeña espera para que el autoenfoque estabilice la imagen
      await new Promise((r) => setTimeout(r, 350));
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
      if (IC) {
        try {
          const bitmap = await new IC(track).grabFrame();
          c.width = bitmap.width;
          c.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          setFrozen(c.toDataURL("image/jpeg", 0.95));
          return;
        } catch { /* fallback abajo */ }
      }
      if (!v.videoWidth) return;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      setFrozen(c.toDataURL("image/jpeg", 0.95));
    } finally {
      setBusy(false);
    }
  };

  const unfreeze = async () => {
    setFrozen(null);
    const v = videoRef.current;
    const live = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
    if (!live) {
      await start();
      return;
    }
    if (v) {
      if (!v.srcObject) v.srcObject = streamRef.current;
      await v.play().catch(() => {});
    }
  };

  const onTapScreen = () => {
    if (busy) return;
    if (frozen) unfreeze();
    else freeze();
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success text-success-foreground">
            <Search className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Lupa</h1>
          <button
            onClick={toggleTorch}
            disabled={!running || !torchAvailable}
            aria-pressed={torchOn}
            className={[
              "ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold active:scale-[0.97] active:shadow-inner disabled:opacity-50",
              torchOn ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground",
            ].join(" ")}
          >
            {torchOn ? <LightbulbOff className="h-5 w-5" aria-hidden /> : <Lightbulb className="h-5 w-5" aria-hidden />}
            {torchOn ? "Apagar luz" : "Encender luz"}
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={onTapScreen}
          aria-label={frozen ? "Volver a la lupa en directo" : "Congelar imagen"}
          className="relative mb-2 block w-full overflow-hidden rounded-2xl bg-black"
          style={{ aspectRatio: "3 / 4" }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          />
          {frozen && (
            <img
              src={frozen}
              alt="Imagen ampliada"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-xs font-bold text-white">
            {busy ? "Enfocando…" : frozen ? "Toca para seguir" : "Toca para congelar"}
          </span>
          <canvas ref={canvasRef} className="hidden" />
        </button>

        <div className="rounded-xl bg-card p-3 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-bold">Zoom</h2>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">×{zoom.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={6}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Nivel de zoom"
            className="h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </div>

        {!torchAvailable && running && (
          <p className="mt-3 text-xs text-muted-foreground">
            Esta cámara o navegador no permite encender la linterna. En iPhone (Safari) la linterna no está disponible desde la web.
          </p>
        )}
      </div>
    </main>
  );
}
