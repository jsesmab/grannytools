import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AudioEngine,
  ENVIRONMENTS,
  type EnvironmentPreset,
} from "@/lib/audio-engine";
import { Ear, Mic, MicOff, AlertTriangle, Zap, MoreVertical, X, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OyeBien — Amplificador de sonido para conversaciones" },
      {
        name: "description",
        content:
          "App web para amplificar conversaciones, TV, restaurante y calle usando los auriculares del móvil. Pensada para personas con pérdida auditiva leve o moderada.",
      },
      { property: "og:title", content: "OyeBien — Amplificador de sonido" },
      {
        property: "og:description",
        content:
          "Amplifica las voces a tu alrededor con tu móvil y tus auriculares.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const engineRef = useRef<AudioEngine | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [running, setRunning] = useState(false);
  const [preset, setPreset] = useState<EnvironmentPreset>(ENVIRONMENTS[0]);
  const [volumeDb, setVolumeDb] = useState(12);
  const [balance, setBalance] = useState(0);
  const [boost, setBoost] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [eqOpen, setEqOpen] = useState(false);
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);

  const applyEq = (b: number, m: number, t: number) => {
    setBass(b); setMid(m); setTreble(t);
    engineRef.current?.setEqOffsets({ bass: b, mid: m, treble: t });
  };
  const resetEq = () => applyEq(0, 0, 0);


  const BOOST_DB = 15;
  const effectiveDb = (db: number, b: boolean) => db + (b ? BOOST_DB : 0);

  // Audio level meter loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const e = engineRef.current;
      if (e) setLevel(e.getLevel());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  const requestWakeLock = async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch (e) {
      console.warn("wakeLock failed", e);
    }
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && running) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running]);

  const start = async () => {
    setError(null);
    try {
      const engine = engineRef.current ?? new AudioEngine();
      engineRef.current = engine;
      await engine.start({ preset, masterDb: effectiveDb(volumeDb, boost), balance });
      await requestWakeLock();
      setRunning(true);
    } catch (e) {
      console.error(e);
      setError(
        "No se pudo acceder al micrófono. Permite el acceso en tu navegador y vuelve a intentarlo.",
      );
    }
  };

  const stop = async () => {
    await engineRef.current?.stop();
    try { await wakeLockRef.current?.release(); } catch { /* ignore */ }
    wakeLockRef.current = null;
    setRunning(false);
    setLevel(0);
  };

  const handlePreset = (p: EnvironmentPreset) => {
    setPreset(p);
    engineRef.current?.applyPreset(p);
  };

  const handleVolume = (db: number) => {
    setVolumeDb(db);
    engineRef.current?.setMasterDb(effectiveDb(db, boost));
  };

  const toggleBoost = () => {
    const next = !boost;
    setBoost(next);
    engineRef.current?.setMasterDb(effectiveDb(volumeDb, next));
  };

  const handleBalance = (b: number) => {
    setBalance(b);
    engineRef.current?.setBalance(b);
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        {/* Header */}
        <header className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ear className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold leading-tight">OyeBien</h1>
          <button
            onClick={() => setEqOpen(true)}
            aria-label="Ecualizador"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95] transition-all"
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>
        </header>


        {/* Main start/stop button */}
        <button
          onClick={running ? stop : start}
          className={[
            "mb-3 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-lg font-bold shadow-lg transition-all select-none",
            "active:scale-[0.98] active:shadow-inner",
            running
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground",
          ].join(" ")}
          aria-pressed={running}
        >
          {running ? (
            <>
              <MicOff className="h-6 w-6" aria-hidden />
              Detener
            </>
          ) : (
            <>
              <Mic className="h-6 w-6" aria-hidden />
              Empezar a escuchar
            </>
          )}
        </button>

        {/* Level meter */}
        <div
          className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Nivel de sonido"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-75"
            style={{ width: `${Math.min(100, level * 180)}%` }}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        )}

        {/* Environment presets */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {ENVIRONMENTS.map((p) => {
            const active = p.id === preset.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePreset(p)}
                aria-pressed={active}
                className={[
                  "rounded-xl border-2 p-2 text-center transition-all min-h-[44px] select-none flex items-center justify-center font-bold",
                  "active:scale-[0.97] active:shadow-inner",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-inner ring-2 ring-primary translate-y-px"
                    : "border-border bg-secondary text-secondary-foreground",
                ].join(" ")}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Volume */}
        <div className="mb-3 rounded-xl bg-card p-3 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-bold">Volumen</h2>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {volumeDb > 0 ? "+" : ""}{volumeDb} dB
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-10}
              max={40}
              step={1}
              value={volumeDb}
              onChange={(e) => handleVolume(Number(e.target.value))}
              aria-label="Volumen general"
              className="h-3 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <button
              onClick={toggleBoost}
              aria-pressed={boost}
              className={[
                "flex items-center gap-1 rounded-lg border-2 px-2 py-1.5 text-sm font-bold transition-all select-none",
                "active:scale-[0.95] active:shadow-inner",
                boost
                  ? "border-warning bg-warning text-warning-foreground shadow-inner ring-2 ring-warning translate-y-px"
                  : "border-border bg-secondary text-secondary-foreground",
              ].join(" ")}
            >
              <Zap className="h-4 w-4" aria-hidden />
              Turbo
            </button>
          </div>
        </div>


        {/* Balance L/R */}
        <div className="rounded-xl bg-card p-3 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-bold">Balance</h2>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {balance === 0
                ? "Centro"
                : balance < 0
                  ? `Izq ${Math.round(Math.abs(balance) * 100)}%`
                  : `Der ${Math.round(balance * 100)}%`}
            </span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={balance}
            onChange={(e) => handleBalance(Number(e.target.value))}
            aria-label="Balance izquierda y derecha"
            className="h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </div>
      </div>

      {eqOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background"
          role="dialog"
          aria-label="Ecualizador"
        >
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 py-3">
            <header className="mb-4 flex items-center gap-2">
              <h2 className="text-xl font-bold">Ecualizador</h2>
              <button
                onClick={resetEq}
                className="ml-auto flex items-center gap-1 rounded-lg border-2 border-border bg-secondary px-2 py-1.5 text-sm font-bold text-secondary-foreground active:scale-[0.95]"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restablecer
              </button>
              <button
                onClick={() => setEqOpen(false)}
                aria-label="Cerrar"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <p className="mb-4 text-sm text-muted-foreground">
              Ajusta los graves, medios y agudos sobre el preset actual.
            </p>

            {([
              { label: "Graves", value: bass, set: (v: number) => applyEq(v, mid, treble) },
              { label: "Medios", value: mid, set: (v: number) => applyEq(bass, v, treble) },
              { label: "Agudos", value: treble, set: (v: number) => applyEq(bass, mid, v) },
            ] as const).map((b) => (
              <div key={b.label} className="mb-4 rounded-xl bg-card p-3 shadow-sm">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-base font-bold">{b.label}</h3>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                    {b.value > 0 ? "+" : ""}{b.value} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={b.value}
                  onChange={(e) => b.set(Number(e.target.value))}
                  aria-label={b.label}
                  className="h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

