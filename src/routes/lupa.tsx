import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, Lightbulb, LightbulbOff, AlertTriangle } from "lucide-react";
import { usePrefs } from "@/hooks/use-prefs";

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
  getCapabilities?: () => MediaTrackCapabilities;
};

type ImageCaptureLike = { grabFrame: () => Promise<ImageBitmap> };

function Lupa() {
  const { prefs } = usePrefs();
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);


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
      const caps = track.getCapabilities?.() as unknown as { torch?: boolean; focusMode?: string[] } | undefined;
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
    setPan({ x: 0, y: 0 });
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
    else {
      setPan({ x: 0, y: 0 });
      freeze();
    }
  };

  // Arrastrar la imagen congelada para leer cómodamente
  const onPointerDown = (e: React.PointerEvent) => {
    if (!frozen) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !frozen) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) d.moved = true;
    setPan({ x: d.ox + dx, y: d.oy + dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (frozen && d?.moved) return; // fue un arrastre, no un toque
    onTapScreen();
  };


  return (
    <main className="fixed inset-0 bg-black text-white">
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTapScreen(); } }}
        aria-label={frozen ? "Volver a la lupa en directo" : "Congelar imagen"}
        className="absolute inset-0 touch-none select-none overflow-hidden"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "center",
            filter: `brightness(${prefs.brightness}) contrast(${1 + (prefs.brightness - 1) * 0.4})`,
          }}
        />
        {frozen && (
          <img
            src={frozen}
            alt="Imagen ampliada"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center",
              filter: `brightness(${prefs.brightness}) contrast(${1 + (prefs.brightness - 1) * 0.4})`,
            }}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Barra superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3">
        <a
          href="/"
          aria-label="Inicio"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-xl bg-black/60 text-white active:scale-[0.95]"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden />
        </a>
        <button
          onClick={toggleTorch}
          disabled={!running || !torchAvailable}
          aria-pressed={torchOn}
          className={[
            "pointer-events-auto ml-auto flex items-center gap-2 rounded-xl px-4 py-3 text-base font-bold active:scale-[0.97] disabled:opacity-40",
            torchOn ? "bg-warning text-warning-foreground" : "bg-black/60 text-white",
          ].join(" ")}
        >
          {torchOn ? <LightbulbOff className="h-6 w-6" aria-hidden /> : <Lightbulb className="h-6 w-6" aria-hidden />}
          {torchOn ? "Apagar luz" : "Luz"}
        </button>
      </div>

      {error && (
        <div role="alert" className="absolute inset-x-3 top-20 flex items-start gap-2 rounded-xl bg-destructive p-3 text-destructive-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Barra inferior: estado + zoom */}
      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-black/60 px-4 pb-5 pt-3">
        <div className="flex items-baseline justify-between text-sm font-bold">
          <span>{busy ? "Enfocando…" : frozen ? "Arrastra para mover · toca para seguir" : "Toca para congelar"}</span>
          <span className="tabular-nums">×{zoom.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={1}
          max={6}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Nivel de zoom"
          className="h-3 w-full cursor-pointer appearance-none rounded-full bg-white/30 accent-primary"
        />
      </div>
    </main>
  );
}

