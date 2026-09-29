import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HeartHandshake } from "lucide-react";
import {
  FALL_COUNTDOWN_SEC,
  createFallDetector,
  getEmergencyPhone,
  isFallEnabled,
  sendEmergency,
} from "./fall-detection";

let triggerTest: (() => void) | null = null;

/** Lanza la cuenta atrás de prueba desde cualquier pantalla. */
export function simulateFall() {
  triggerTest?.();
}

class AlarmTone {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;

  start() {
    if (this.ctx) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      lfo.frequency.value = 2;
      lfoGain.gain.value = 0.25;
      gain.gain.value = 0.25;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      lfo.start();
      this.ctx = ctx;
      this.osc = osc;
    } catch {
      /* ignore */
    }
  }

  stop() {
    try { this.osc?.stop(); } catch { /* ignore */ }
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.osc = null;
  }
}

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    const es = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("es"));
    if (es) u.voice = es;
    u.lang = "es-ES";
    u.rate = 0.95;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

export function FallGuard() {
  const [left, setLeft] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const toneRef = useRef(new AlarmTone());
  const tickRef = useRef<number | null>(null);
  const leftRef = useRef(FALL_COUNTDOWN_SEC);

  const stopAll = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    toneRef.current.stop();
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    try { navigator.vibrate?.(0); } catch { /* ignore */ }
  };

  const fire = async () => {
    stopAll();
    setSent(true);
    const phone = getEmergencyPhone();
    if (phone) await sendEmergency(phone);
  };

  const startCountdown = () => {
    if (tickRef.current) return;
    leftRef.current = FALL_COUNTDOWN_SEC;
    setSent(false);
    setLeft(FALL_COUNTDOWN_SEC);
    toneRef.current.start();
    try { navigator.vibrate?.([600, 300, 600, 300, 600]); } catch { /* ignore */ }
    speak("¿Estás bien? Se ha detectado una caída. Si estás bien, pulsa el botón verde.");
    tickRef.current = window.setInterval(() => {
      leftRef.current -= 1;
      setLeft(leftRef.current);
      if (leftRef.current <= 0) void fire();
    }, 1000);
  };

  useEffect(() => {
    triggerTest = startCountdown;
    return () => {
      triggerTest = null;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const det = createFallDetector(() => startCountdown());
    let running = false;
    const sync = () => {
      const want = isFallEnabled();
      if (want && !running) { det.start(); running = true; }
      if (!want && running) { det.stop(); running = false; }
    };
    sync();
    const id = window.setInterval(sync, 3000);
    return () => {
      window.clearInterval(id);
      if (running) det.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopAll(), []);

  if (left === null) return null;

  const cancel = () => {
    stopAll();
    setLeft(null);
    setSent(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-destructive p-5 text-destructive-foreground">
      <AlertTriangle className="h-16 w-16" aria-hidden />
      <p className="text-center text-3xl font-black leading-tight">
        {sent ? "Pidiendo ayuda…" : "¿Estás bien?"}
      </p>
      {!sent && (
        <>
          <p className="text-center text-xl font-bold">
            Parece que te has caído. Si estás bien, pulsa el botón verde.
          </p>
          <p className="text-[6rem] font-black leading-none tabular-nums">{Math.max(left, 0)}</p>
        </>
      )}
      {sent && (
        <p className="text-center text-xl font-bold">
          Se ha enviado tu ubicación y se está llamando a tu contacto de ayuda.
        </p>
      )}
      <button
        onClick={cancel}
        className="flex w-full max-w-md items-center justify-center gap-3 rounded-3xl bg-success px-4 py-8 text-3xl font-black text-success-foreground shadow-lg active:scale-[0.98]"
      >
        <HeartHandshake className="h-10 w-10" aria-hidden />
        ESTOY BIEN
      </button>
    </div>
  );
}
