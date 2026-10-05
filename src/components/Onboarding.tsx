import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { loadContacts, saveContactsToStorage } from "@/lib/contacts";
import { requestMotionPermission, setEmergencyPhone, setFallEnabled } from "@/lib/fall-detection";

export const ONBOARDED_KEY = "grannytools.onboarded";
const USER_NAME_KEY = "grannytools.username";

type Perm = "ubicacion" | "avisos" | "camara" | "caidas";
const PERMS: { key: Perm; icon: string; title: string; text: string; btn: string }[] = [
  { key: "ubicacion", icon: "📍", title: "Ubicación", text: "Para que tu familia sepa dónde estás si te pierdes o sufres una caída.", btn: "Permitir ubicación" },
  { key: "avisos", icon: "🔔", title: "Avisos", text: "Para avisarte de las pastillas a su hora y de las citas.", btn: "Permitir avisos" },
  { key: "camara", icon: "🔍", title: "Cámara y micrófono", text: "Para la lupa con luz y el amplificador para oír mejor.", btn: "Permitir cámara y sonido" },
  { key: "caidas", icon: "🏃", title: "Sensor de caídas", text: "Para vigilar caídas y llamar a tu contacto de ayuda.", btn: "Activar detector" },
];

async function ask(p: Perm): Promise<boolean> {
  try {
    if (p === "ubicacion") {
      return await new Promise((r) => navigator.geolocation.getCurrentPosition(() => r(true), () => r(false), { timeout: 15000 }));
    }
    if (p === "avisos") return "Notification" in window && (await Notification.requestPermission()) === "granted";
    if (p === "camara") {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    }
    const ok = await requestMotionPermission();
    if (ok) setFallEnabled(true);
    return ok;
  } catch {
    return false;
  }
}

export function Onboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [granted, setGranted] = useState<Partial<Record<Perm, boolean>>>({});
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    try { if (!localStorage.getItem(ONBOARDED_KEY)) setShow(true); } catch { /* ignore */ }
  }, []);
  if (!show) return null;

  const finish = (toLink = false) => {
    try {
      if (name.trim()) localStorage.setItem(USER_NAME_KEY, name.trim());
      if (cName.trim() && cPhone.trim()) {
        const list = loadContacts().filter((c) => c.phone !== cPhone.trim());
        saveContactsToStorage([{ name: cName.trim(), phone: cPhone.trim() }, ...list]);
        setEmergencyPhone(cPhone.trim());
      }
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch { /* ignore */ }
    setShow(false);
    if (toLink) navigate({ to: "/vincular" });
    else window.location.reload();
  };

  const big = "w-full rounded-2xl py-4 text-xl font-bold";
  const input = "w-full rounded-2xl border-4 border-border bg-card p-4 text-2xl";

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background p-5 text-foreground">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5">
        <p className="text-center text-sm font-bold text-muted-foreground">Paso {step + 1} de 4</p>
        {step === 0 && (
          <>
            <h1 className="text-center text-3xl font-black">¡Bienvenido a Grannytools!</h1>
            <label className="text-2xl font-bold" htmlFor="ob-name">¿Cómo te llamas?</label>
            <input id="ob-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Carmen" />
            <button className={`${big} bg-primary text-primary-foreground`} onClick={() => setStep(1)}>Siguiente</button>
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="text-center text-2xl font-black">Permisos que necesito</h1>
            <p className="text-center text-base">Cuando el móvil pregunte, pulsa <b>Permitir</b>.</p>
            {PERMS.map((p) => (
              <div key={p.key} className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
                <p className="text-xl font-bold">{p.icon} {p.title}</p>
                <p className="text-base">{p.text}</p>
                {granted[p.key] ? (
                  <p className="rounded-xl bg-success p-3 text-center text-lg font-bold text-success-foreground">✓ Permitido</p>
                ) : (
                  <button className={`${big} bg-primary text-primary-foreground`} onClick={async () => { const ok = await ask(p.key); setGranted((g) => ({ ...g, [p.key]: ok })); }}>
                    {granted[p.key] === false ? "Volver a intentar" : p.btn}
                  </button>
                )}
              </div>
            ))}
            <button className={`${big} bg-secondary text-secondary-foreground`} onClick={() => setStep(2)}>Siguiente</button>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-center text-2xl font-black">¿A quién llamamos si necesitas ayuda?</h1>
            <input className={input} value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nombre (p. ej. Ana, mi hija)" />
            <input className={input} type="tel" inputMode="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Teléfono" />
            <button className={`${big} bg-primary text-primary-foreground`} onClick={() => setStep(3)}>{cName && cPhone ? "Guardar y seguir" : "Ahora no"}</button>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="text-center text-3xl font-black">¡Todo listo{name ? `, ${name}` : ""}!</h1>
            <button className={`${big} bg-success text-success-foreground`} onClick={() => finish()}>Entrar a Grannytools</button>
            <button className={`${big} bg-secondary text-secondary-foreground`} onClick={() => finish(true)}>Vincular con un familiar</button>
            <p className="text-center text-sm text-muted-foreground">Puedes vincularlo más tarde desde la rueda dentada.</p>
          </>
        )}
        {step > 0 && <button className="text-lg font-bold underline" data-flat-button onClick={() => setStep(step - 1)}>Atrás</button>}
      </div>
    </div>
  );
}
