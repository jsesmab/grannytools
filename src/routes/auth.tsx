import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — Grannytools Family" },
      { name: "description", content: "Entra en Grannytools Family para cuidar de tus mayores o residentes desde el móvil o el ordenador." },
      { property: "og:title", content: "Acceso — Grannytools Family" },
      { property: "og:description", content: "Panel para familiares y cuidadores de Grannytools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/family", replace: true }); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) nav({ to: "/family", replace: true }); });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setMsg("Email o contraseña incorrectos.");
    } else {
      const { error } = await supabase.auth.signUp({ email, password: pass,
        options: { emailRedirectTo: `${window.location.origin}/auth`, data: { full_name: name } } });
      setMsg(error ? error.message : "Te hemos enviado un correo. Ábrelo para confirmar tu cuenta y vuelve aquí.");
    }
    setBusy(false);
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (r.error) setMsg("No se pudo entrar con Google.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md space-y-5 rounded-3xl border-2 border-border bg-card p-6">
        <div>
          <img src="/family-icon-192.png" alt="Grannytools Family" width={112} height={112} className="mx-auto mb-4 h-28 w-28 object-contain" />
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Grannytools Family</p>
          <h1 className="text-3xl font-extrabold">{mode === "in" ? "Entrar" : "Crear cuenta"}</h1>
          <p className="mt-1 text-muted-foreground">Para familiares y cuidadores.</p>
        </div>
        <button onClick={google} className="w-full rounded-2xl bg-secondary py-3 text-lg font-bold text-secondary-foreground">
          Continuar con Google
        </button>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre"
              className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-lg" />
          )}
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-lg" />
          <input required type="password" minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Contraseña"
            className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-lg" />
          <button disabled={busy} className="w-full rounded-2xl bg-primary py-3 text-lg font-bold text-primary-foreground">
            {mode === "in" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        {msg && <p className="rounded-xl bg-muted p-3 font-semibold">{msg}</p>}
        <button data-flat-button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }} className="w-full text-center font-semibold text-primary underline">
          {mode === "in" ? "¿No tienes cuenta? Créala" : "Ya tengo cuenta"}
        </button>
      </div>
    </main>
  );
}
