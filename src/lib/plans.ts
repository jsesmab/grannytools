/** Planes de Family. Los límites se aplican en el servidor (redeemInvite). */
export type PlanId = "family_basico_yearly" | "family_extendido_yearly" | "empresa_10_monthly" | "empresa_25_monthly" | "empresa_plus_monthly";

export type Plan = {
  id: PlanId; name: string; price: string; period: string; limit: number | "por persona";
  for: string; can: string[]; cannot: string[]; group: "familia" | "empresa";
};

const BASE = ["Ver el día, la agenda y el histórico", "Crear y cambiar citas, tareas y medicinas", "Cambiar el modo Autónomo / Protegido", "Invitar a otros familiares (Administrador o Consultas)"];

export const PLANS: Plan[] = [
  { id: "family_basico_yearly", name: "Familia Básico", price: "4,99 €", period: "al año", limit: 2, group: "familia",
    for: "Para cuidar de papá y mamá.",
    can: ["Vincular hasta 2 personas", ...BASE],
    cannot: ["Vincular una 3.ª persona", "Uso profesional o en residencias"] },
  { id: "family_extendido_yearly", name: "Familia Extendido", price: "9,99 €", period: "al año", limit: 5, group: "familia",
    for: "Para familias con abuelos, tíos o suegros.",
    can: ["Vincular hasta 5 personas", ...BASE],
    cannot: ["Vincular una 6.ª persona", "Uso profesional o en residencias"] },
  { id: "empresa_10_monthly", name: "Empresa 10", price: "19,99 €", period: "al mes", limit: 10, group: "empresa",
    for: "Cuidadores profesionales y centros pequeños.",
    can: ["Vincular hasta 10 personas", ...BASE, "Uso profesional permitido", "Darse de baja cualquier mes"],
    cannot: ["Vincular más de 10 personas"] },
  { id: "empresa_25_monthly", name: "Empresa 25", price: "39,99 €", period: "al mes", limit: 25, group: "empresa",
    for: "Residencias y centros de día.",
    can: ["Vincular hasta 25 personas", ...BASE, "Uso profesional permitido", "Darse de baja cualquier mes"],
    cannot: ["Vincular más de 25 personas"] },
  { id: "empresa_plus_monthly", name: "Empresa a medida", price: "1,50 €", period: "al mes por persona", limit: "por persona", group: "empresa",
    for: "Más de 25 personas. Eliges cuántas (mínimo 26).",
    can: ["Vincular tantas personas como contrates", ...BASE, "Uso profesional permitido", "Ampliar o reducir cada mes"],
    cannot: ["Vincular más personas de las contratadas"] },
];

export const DEMO_CAN = ["Ver una persona de ejemplo con datos simulados", "Probar el panel del día y el histórico"];
export const DEMO_CANNOT = ["Vincular personas reales", "Guardar cambios"];

type SubRow = { price_id: string; quantity: number | null; status: string; current_period_end: string | null };

/** Cuántas personas permite la suscripción vigente (0 sin plan). */
export function planLimit(rows: SubRow[]): { limit: number; plan: SubRow | null } {
  const now = Date.now();
  let best: { limit: number; plan: SubRow | null } = { limit: 0, plan: null };
  for (const r of rows) {
    const end = r.current_period_end ? new Date(r.current_period_end).getTime() : null;
    const ok = (["active", "trialing", "past_due"].includes(r.status) && (end === null || end > now)) || (r.status === "canceled" && end !== null && end > now);
    if (!ok) continue;
    const p = PLANS.find((x) => x.id === r.price_id);
    const limit = !p ? 0 : p.limit === "por persona" ? (r.quantity ?? 0) : p.limit;
    if (limit > best.limit) best = { limit, plan: r };
  }
  return best;
}
