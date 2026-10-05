import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FamilyShell } from "@/components/FamilyShell";
import { redeemInvite } from "@/lib/family.functions";

export const Route = createFileRoute("/_authenticated/family/vincular")({
  head: () => ({
    meta: [
      { title: "Vincular persona — Grannytools Family" },
      { name: "description", content: "Introduce el código que aparece en el teléfono de la persona para empezar a cuidarla." },
      { property: "og:title", content: "Vincular persona — Grannytools Family" },
      { property: "og:description", content: "Conecta con el Grannytools de una persona." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Vincular,
});

function Vincular() {
  const redeem = useServerFn(redeemInvite);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [code, setCode] = useState("GT-");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      // Acepta también el contenido del QR pegado.
      let c = code.trim();
      try { const j = JSON.parse(c); if (j?.code) c = j.code; } catch { /* código escrito */ }
      const r = await redeem({ data: { code: c } });
      if (!r.ok) { setMsg(r.error); return; }
      await qc.invalidateQueries({ queryKey: ["family"] });
      nav({ to: "/family/persona/$id", params: { id: r.elderId } });
    } catch { setMsg("Código no válido. Debe ser como GT-ABC123."); }
    finally { setBusy(false); }
  };

  return (
    <FamilyShell title="Vincular persona">
      <form onSubmit={go} className="max-w-md space-y-4 rounded-3xl border-2 border-border bg-card p-6">
        <p>En el teléfono de la persona: rueda de <b>Ajustes</b> → <b>Vincular con un familiar</b>. Escribe el código que aparece (caduca en 10 min).</p>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9}
          className="w-full rounded-xl border-2 border-input bg-background px-4 py-4 text-center text-3xl font-black tracking-widest" />
        <button disabled={busy} className="w-full rounded-2xl bg-primary py-3 text-lg font-bold text-primary-foreground">Vincular</button>
        {msg && <p className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{msg}</p>}
        <p className="text-sm text-muted-foreground">La primera persona que se vincula es Administrador. Las siguientes entran como Consultas y un Administrador puede cambiarlo.</p>
      </form>
    </FamilyShell>
  );
}
