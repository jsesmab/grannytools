import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, Lightbulb, LightbulbOff, Camera, Play, RotateCcw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/lupa")({
  head: () => ({
    meta: [
      { title: "Grannytools — Lupa" },
      { name: "description", content: "Usa la cámara del móvil como lupa para leer letra pequeña, etiquetas y documentos." },
      { property: "og:title", content: "Grannytools — Lupa" },
      { property: "og:description", content: "Amplía lo que quieras leer con la cámara de tu móvil." },
    ],
  }),
  component: Lupa,
});

type TrackWithTorch = MediaStreamTrack & {
  applyConstraints: (c: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> }) => Promise<void>;
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

function Lupa() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null);
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
      setTorchAvailable(Boolean((caps as unknown as { torch?: boolean } | undefined)?.torch));
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

  useEffect(() => () => stop(), []);

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

  const freeze = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setFrozen(c.toDataURL("image/jpeg", 0.9));
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
        </header>

        {!running && !frozen && (
          <button
            onClick={start}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-4 text-lg font-bold text-primary-foreground shadow-lg active:scale-[0.98] active:shadow-inner"
          >
            <Camera className="h-6 w-6" aria-hidden />
            Encender lupa
          </button>
        )}

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="relative mb-3 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "3 / 4" }}>
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
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {(running || frozen) && (
          <>
            <div className="mb-3 rounded-xl bg-card p-3 shadow-sm">
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

            <div className="mb-3 grid grid-cols-2 gap-2">
              {frozen ? (
                <button
                  onClick={unfreeze}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-base font-bold text-primary-foreground active:scale-[0.97] active:shadow-inner"
                >
                  <Play className="h-5 w-5" aria-hidden />
                  Seguir
                </button>
              ) : (
                <button
                  onClick={freeze}
                  disabled={!running}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-base font-bold text-primary-foreground active:scale-[0.97] active:shadow-inner disabled:opacity-50"
                >
                  <Camera className="h-5 w-5" aria-hidden />
                  Congelar
                </button>
              )}
              <button
                onClick={toggleTorch}
                disabled={!running || !torchAvailable}
                aria-pressed={torchOn}
                className={[
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-bold active:scale-[0.97] active:shadow-inner disabled:opacity-50",
                  torchOn ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground",
                ].join(" ")}
              >
                {torchOn ? <LightbulbOff className="h-5 w-5" aria-hidden /> : <Lightbulb className="h-5 w-5" aria-hidden />}
                {torchOn ? "Apagar luz" : "Encender luz"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setZoom(2)}
                className="flex items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground active:scale-[0.97]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Zoom normal
              </button>
              <button
                onClick={stop}
                className="rounded-xl bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground active:scale-[0.97]"
              >
                Apagar lupa
              </button>
            </div>

            {!torchAvailable && running && (
              <p className="mt-3 text-xs text-muted-foreground">
                Esta cámara o navegador no permite encender la linterna. En iPhone (Safari) la linterna no está disponible desde la web.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
