import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { membersQuery } from "@/lib/family-data";
import { familyMemberAction } from "@/lib/family.functions";
import { supabase } from "@/integrations/supabase/client";

/** Familiares vinculados con una persona atendida. Solo el Administrador cambia roles o quita. */
export function FamilyMembers({ elderId, admin }: { elderId: string; admin: boolean }) {
  const qc = useQueryClient();
  const { data: members = [] } = useQuery(membersQuery(elderId));
  const memberAct = useServerFn(familyMemberAction);
  const [me, setMe] = useState<string>();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id)); }, []);
  const act = async (memberId: string, action: "admin" | "consulta" | "remove") => {
    if (action === "remove" && !confirm("¿Quitar a esta persona de la familia vinculada?")) return;
    await memberAct({ data: { elderId, memberId, action } });
    qc.invalidateQueries({ queryKey: ["family"] });
  };
  return (
    <section className="space-y-3 rounded-3xl border-2 border-border bg-card p-5">
      <h2 className="text-xl font-extrabold">Familia vinculada</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3">
            <span className="flex-1 font-bold">{m.profile?.display_name || "Familiar"}{m.user_id === me ? " (tú)" : ""}
              {m.profile?.phone ? <span className="block text-sm font-normal text-muted-foreground">{m.profile.phone}</span> : null}</span>
            {admin ? (<>
              <select value={m.role} onChange={(ev) => act(m.id, ev.target.value as "admin" | "consulta")}
                className="rounded-xl border-2 border-input bg-background px-2 py-2 text-sm font-semibold">
                <option value="admin">Administrador</option>
                <option value="consulta">Consultas</option>
              </select>
              {m.user_id !== me && <button onClick={() => act(m.id, "remove")} className="rounded-xl bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground">Quitar</button>}
            </>) : <span className="text-sm font-semibold">{m.role === "admin" ? "Administrador" : "Consultas"}</span>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Para añadir a alguien más, genera un código nuevo en el teléfono de la persona.</p>
    </section>
  );
}
