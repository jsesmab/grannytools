import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FamilyShell } from "@/components/FamilyShell";
import { supabase } from "@/integrations/supabase/client";
import { biometricAvailable, biometricEnabled, setBiometricEnabled } from "@/lib/biometrics";

export const Route = createFileRoute("/_authenticated/family/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil — Grannytools Family" },
      { name: "description", content: "Tu nombre, foto y teléfono como familiar o cuidador." },
      { property: "og:title", content: "Mi perfil — Grannytools Family" },
      { property: "og:description", content: "Datos del familiar o cuidador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Perfil,
});

function Perfil() {
  const [p, setP] = useState({ display_name: "", phone: "", avatar_url: "" });
  const [msg, setMsg] = useState("");
  const [bioOk, setBioOk] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  useEffect(() => { biometricAvailable().then(setBioOk); setBioOn(biometricEnabled()); }, []);
  const toggleBio = async () => {
    const ok = await setBiometricEnabled(!bioOn);
    if (ok) setBioOn(!bioOn); else setMsg("No se pudo comprobar la huella.");
  };
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const { data: row } = await supabase.from("profiles").select("display_name, phone, avatar_url").eq("id", data.user!.id).maybeSingle();
      if (row) setP({ display_name: row.display_name, phone: row.phone ?? "", avatar_url: row.avatar_url ?? "" });
    });
  }, []);

  const pickPhoto = (f?: File) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); const s = 160; c.width = s; c.height = s;
      const k = Math.max(s / img.width, s / img.height);
      c.getContext("2d")!.drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      setP((x) => ({ ...x, avatar_url: c.toDataURL("image/jpeg", 0.8) }));
    };
    img.src = URL.createObjectURL(f);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").upsert({ id: data.user!.id, display_name: p.display_name.trim(), phone: p.phone.trim() || null, avatar_url: p.avatar_url || null });
    setMsg(error ? "No se pudo guardar." : "Guardado.");
  };

  return (
    <FamilyShell title="Mi perfil">
      <form onSubmit={save} className="max-w-md space-y-4 rounded-3xl border-2 border-border bg-card p-6">
        <label className="flex items-center gap-4">
          {p.avatar_url ? <img src={p.avatar_url} alt="Tu foto" className="h-20 w-20 rounded-full object-cover" />
            : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-3xl">👤</span>}
          <span className="font-bold text-primary underline">Cambiar foto</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label>
        <input required value={p.display_name} onChange={(e) => setP({ ...p, display_name: e.target.value })} placeholder="Nombre"
          className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-lg" />
        <input type="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} placeholder="Teléfono"
          className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-lg" />
        <button className="w-full rounded-2xl bg-primary py-3 text-lg font-bold text-primary-foreground">Guardar</button>
        {msg && <p className="font-semibold">{msg}</p>}
      </form>
      <section className="max-w-md space-y-3 rounded-3xl border-2 border-border bg-card p-6">
        <h2 className="text-xl font-extrabold">Entrar con huella o Face ID</h2>
        {bioOk ? (
          <>
            <p className="text-muted-foreground">Al abrir la app te pedirá la huella o la cara en lugar de la contraseña. Tu huella nunca sale del teléfono.</p>
            <button onClick={toggleBio} aria-pressed={bioOn} className={`w-full rounded-2xl py-3 text-lg font-bold ${bioOn ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {bioOn ? "Activado — tocar para desactivar" : "Activar"}
            </button>
          </>
        ) : (
          <p className="text-muted-foreground">Disponible en la app Family instalada desde Google Play o App Store, en teléfonos con huella o Face ID.</p>
        )}
      </section>
    </FamilyShell>
  );
}
