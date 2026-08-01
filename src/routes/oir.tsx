import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AudioEngine,
  ENVIRONMENTS,
  type EnvironmentPreset,
  type VoiceFingerprint,
} from "@/lib/audio-engine";
import { Ear, Mic, MicOff, AlertTriangle, Zap, MoreVertical, X, RotateCcw, Loader2, UserCheck, Hand, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/oir")({
  head: () => ({
    meta: [
      { title: "Grannytools — Oír mejor" },
      {
        name: "description",
        content:
          "Amplifica conversaciones, TV, restaurante y calle usando los auriculares del móvil. Pensado para personas mayores con pérdida auditiva leve o moderada.",
      },
      { property: "og:title", content: "Grannytools — Oír mejor" },
      { property: "og:description", content: "Amplifica las voces a tu alrededor con tu móvil y tus auriculares." },

    ],
  }),
  component: Index,
});

const VOICE_KEY = "oyebien.voiceProfile";
const AUTO_KEY = "oyebien.autoCancel";

function Index() {
  const engineRef = useRef<AudioEngine | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [running, setRunning] = useState(false);
  const [startingAudio, setStartingAudio] = useState(false);
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

  const [voiceProfile, setVoiceProfile] = useState<VoiceFingerprint | null>(null);
  const [autoCancel, setAutoCancel] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [ptt, setPtt] = useState(false);

  // Load persisted profile + preference
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOICE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as number[];
        if (Array.isArray(arr) && arr.length > 0) setVoiceProfile(arr);
      }
      const auto = localStorage.getItem(AUTO_KEY);
      if (auto !== null) setAutoCancel(auto === "1");
    } catch { /* ignore */ }
  }, []);

  const applyEq = (b: number, m: number, t: number) => {
    setBass(b); setMid(m); setTreble(t);
    engineRef.current?.setEqOffsets({ bass: b, mid: m, treble: t });
  };
  const resetEq = () => applyEq(0, 0, 0);

  const BOOST_DB = 6;
  const effectiveDb = (db: number, b: boolean) => db + (b ? BOOST_DB : 0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const e = engineRef.current;
      if (e) setLevel(e.getLevel());
    }, 120);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => () => { engineRef.current?.stop(); }, []);

  const requestWakeLock = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };
      if (nav.wakeLock) wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch (e) { console.warn("wakeLock failed", e); }
  };

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && running) requestWakeLock(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running]);

  const start = async () => {
    if (startingAudio) return;
    setError(null);
    try {
      setStartingAudio(true);
      const engine = engineRef.current ?? new AudioEngine();
      engineRef.current = engine;
      await engine.start({ preset, masterDb: effectiveDb(volumeDb, boost), balance });
      engine.setVoiceProfile(voiceProfile);
      engine.setAutoCancel(autoCancel);
      await requestWakeLock();
      setRunning(engine.isRunning());
    } catch (e) {
      console.error(e);
      setError("No se pudo acceder al micrófono. Permite el acceso en tu navegador y vuelve a intentarlo.");
    } finally {
      setStartingAudio(false);
    }
  };

  const stop = async () => {
    await engineRef.current?.stop();
    try { await wakeLockRef.current?.release(); } catch { /* ignore */ }
    wakeLockRef.current = null;
    setRunning(false);
    setLevel(0);
    setPtt(false);
  };

  const handlePreset = (p: EnvironmentPreset) => { setPreset(p); engineRef.current?.applyPreset(p); };
  const handleVolume = (db: number) => { setVolumeDb(db); engineRef.current?.setMasterDb(effectiveDb(db, boost)); };
  const toggleBoost = () => { const next = !boost; setBoost(next); engineRef.current?.setMasterDb(effectiveDb(volumeDb, next)); };
  const handleBalance = (b: number) => { setBalance(b); engineRef.current?.setBalance(b); };

  const pttDown = () => {
    setPtt(true);
    engineRef.current?.setPushToTalk(true);
  };
  const pttUp = () => {
    setPtt(false);
    engineRef.current?.setPushToTalk(false);
  };

  const toggleAutoCancel = () => {
    const next = !autoCancel;
    setAutoCancel(next);
    engineRef.current?.setAutoCancel(next);
    try { localStorage.setItem(AUTO_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  };

  const enroll = async () => {
    if (!running || !engineRef.current) {
      setError("Pulsa primero “Empezar a escuchar” para poder grabar tu voz.");
      return;
    }
    setEnrolling(true);
    try {
      const fp = await engineRef.current.enrollVoice(4);
      const sum = fp.reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        setError("No se detectó tu voz. Habla más cerca del micrófono.");
        return;
      }
      setVoiceProfile(fp);
      engineRef.current.setVoiceProfile(fp);
      try { localStorage.setItem(VOICE_KEY, JSON.stringify(fp)); } catch { /* ignore */ }
      setError(null);
    } finally {
      setEnrolling(false);
    }
  };

  const clearVoice = () => {
    setVoiceProfile(null);
    engineRef.current?.setVoiceProfile(null);
    try { localStorage.removeItem(VOICE_KEY); } catch { /* ignore */ }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95] transition-all">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ear className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold leading-tight">Oír mejor</h1>
          <button
            onClick={() => setEqOpen(true)}
            aria-label="Ajustes"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95] transition-all"
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>
        </header>


        <button
          onClick={running ? stop : start}
          disabled={startingAudio}
          className={[
            "mb-3 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-lg font-bold shadow-lg transition-all select-none",
            "active:scale-[0.98] active:shadow-inner",
            running ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
            startingAudio ? "opacity-70" : "",
          ].join(" ")}
          aria-pressed={running}
        >
          {startingAudio ? (<><Loader2 className="h-6 w-6 animate-spin" aria-hidden />Iniciando...</>) : running ? (<><MicOff className="h-6 w-6" aria-hidden />Detener</>) : (<><Mic className="h-6 w-6" aria-hidden />Empezar a escuchar</>)}
        </button>

        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-label="Nivel de sonido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <div className="h-full rounded-full bg-success transition-[width] duration-75" style={{ width: `${Math.min(100, level * 180)}%` }} />
        </div>

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        )}

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

        <div className="mb-3 rounded-xl bg-card p-3 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-bold">Volumen</h2>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">{volumeDb > 0 ? "+" : ""}{volumeDb} dB</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="range" min={-10} max={22} step={1} value={volumeDb} onChange={(e) => handleVolume(Number(e.target.value))} aria-label="Volumen general" className="h-3 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary" />
            <button
              onClick={toggleBoost}
              aria-pressed={boost}
              className={[
                "flex items-center gap-1 rounded-lg border-2 px-2 py-1.5 text-sm font-bold transition-all select-none",
                "active:scale-[0.95] active:shadow-inner",
                boost ? "border-warning bg-warning text-warning-foreground shadow-inner ring-2 ring-warning translate-y-px" : "border-border bg-secondary text-secondary-foreground",
              ].join(" ")}
            >
              <Zap className="h-4 w-4" aria-hidden />
              Turbo
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-xl bg-card p-3 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-bold">Balance</h2>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {balance === 0 ? "Centro" : balance < 0 ? `Izq ${Math.round(Math.abs(balance) * 100)}%` : `Der ${Math.round(balance * 100)}%`}
            </span>
          </div>
          <input type="range" min={-1} max={1} step={0.1} value={balance} onChange={(e) => handleBalance(Number(e.target.value))} aria-label="Balance izquierda y derecha" className="h-3 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary" />
        </div>

        {/* Push-to-talk: hold to silence your own voice */}
        <button
          onPointerDown={pttDown}
          onPointerUp={pttUp}
          onPointerCancel={pttUp}
          onPointerLeave={pttUp}
          disabled={!running}
          aria-pressed={ptt}
          className={[
            "mb-3 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-4 text-lg font-bold shadow-lg transition-all select-none touch-none",
            "active:scale-[0.98] active:shadow-inner",
            ptt ? "bg-warning text-warning-foreground ring-2 ring-warning translate-y-px" : "bg-secondary text-secondary-foreground",
            !running ? "opacity-50" : "",
          ].join(" ")}
        >
          <Hand className="h-6 w-6" aria-hidden />
          {ptt ? "Silenciando..." : "Mantén: silenciar mi voz"}
        </button>
      </div>

      {eqOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="Ajustes">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto px-3 py-3">
            <header className="mb-4 flex items-center gap-2">
              <h2 className="text-xl font-bold">Ajustes</h2>
              <button onClick={resetEq} className="ml-auto flex items-center gap-1 rounded-lg border-2 border-border bg-secondary px-2 py-1.5 text-sm font-bold text-secondary-foreground active:scale-[0.95]">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reset EQ
              </button>
              <button onClick={() => setEqOpen(false)} aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <h3 className="mb-2 text-base font-bold">Ecualizador</h3>
            <p className="mb-3 text-sm text-muted-foreground">Ajusta graves, medios y agudos sobre el preset actual.</p>

            <div className="mb-6 grid grid-cols-3 gap-3">
              {([
                { label: "Graves", value: bass, set: (v: number) => applyEq(v, mid, treble) },
                { label: "Medios", value: mid, set: (v: number) => applyEq(bass, v, treble) },
                { label: "Agudos", value: treble, set: (v: number) => applyEq(bass, mid, v) },
              ] as const).map((b) => (
                <div key={b.label} className="flex flex-col items-center rounded-xl bg-card p-3 shadow-sm">
                  <h4 className="mb-1 text-base font-bold">{b.label}</h4>
                  <span className="mb-2 text-sm font-semibold tabular-nums text-muted-foreground">{b.value > 0 ? "+" : ""}{b.value} dB</span>
                  <input type="range" min={-12} max={12} step={1} value={b.value} onChange={(e) => b.set(Number(e.target.value))} aria-label={b.label} aria-orientation="vertical" className="h-56 w-3 cursor-pointer appearance-none rounded-full bg-muted accent-primary [writing-mode:vertical-lr] [direction:rtl] [-webkit-appearance:slider-vertical]" />
                </div>
              ))}
            </div>

            <h3 className="mb-2 text-base font-bold">Tu voz</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Graba tu voz para que la app pueda silenciarla automáticamente cuando hables (y evitar oírte con retardo). También puedes silenciarla manualmente con el botón “Mantén: silenciar mi voz” de la pantalla principal.
            </p>

            <div className="mb-3 rounded-xl bg-card p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <UserCheck className={["h-5 w-5", voiceProfile ? "text-success" : "text-muted-foreground"].join(" ")} aria-hidden />
                <span className="text-sm font-semibold">
                  {voiceProfile ? "Voz guardada" : "Sin voz grabada"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={enroll}
                  disabled={enrolling || !running}
                  className={[
                    "flex items-center gap-1 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-all select-none",
                    "active:scale-[0.95] active:shadow-inner",
                    "border-primary bg-primary text-primary-foreground",
                    (enrolling || !running) ? "opacity-60" : "",
                  ].join(" ")}
                >
                  {enrolling ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Grabando 4s...</>) : (<><Mic className="h-4 w-4" aria-hidden />{voiceProfile ? "Volver a grabar" : "Grabar mi voz (4s)"}</>)}
                </button>
                {voiceProfile && (
                  <button onClick={clearVoice} className="flex items-center gap-1 rounded-lg border-2 border-border bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground active:scale-[0.95]">
                    <X className="h-4 w-4" aria-hidden />
                    Borrar voz
                  </button>
                )}
              </div>
              {!running && (
                <p className="mt-2 text-xs text-muted-foreground">Pulsa antes “Empezar a escuchar” en la pantalla principal.</p>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between rounded-xl bg-card p-3 shadow-sm">
              <div className="pr-3">
                <h4 className="text-base font-bold">Silenciar mi voz automáticamente</h4>
                <p className="text-xs text-muted-foreground">
                  Requiere haber grabado tu voz. Cuando la app detecta tu voz cerca del micrófono, baja el sonido durante un instante.
                </p>
              </div>
              <button
                onClick={toggleAutoCancel}
                aria-pressed={autoCancel}
                className={[
                  "shrink-0 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-all select-none",
                  "active:scale-[0.95] active:shadow-inner",
                  autoCancel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground",
                ].join(" ")}
              >
                {autoCancel ? "Activado" : "Desactivado"}
              </button>
            </div>

            <p className="mt-2 rounded-xl bg-card p-3 text-xs text-muted-foreground shadow-sm">
              Consejo: usa auriculares con cable para reducir el retorno. La cancelación automática es más precisa cuanto más cerca hables del micrófono.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
