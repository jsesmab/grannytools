import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { FamilyShell } from "@/components/FamilyShell";
import { DEMO_CAN, DEMO_CANNOT, PLANS, type Plan } from "@/lib/plans";
import { myPlanQuery } from "@/lib/my-plan";
import { createCheckoutSession, createPortalSession } from "@/lib/payments.functions";
import { getStripe, getStripeEnvironment, isTestPayments } from "@/lib/stripe";
import { esDate } from "@/lib/family-data";

export const Route = createFileRoute("/_authenticated/family/planes")({
  validateSearch: (s: Record<string, unknown>): { ok?: string } => ({ ok: typeof s.ok === "string" ? s.ok : undefined }),
  head: () => ({
    meta: [
      { title: "Planes — Grannytools Family" },
      { name: "description", content: "Elige el plan de Grannytools Family: familias desde 4,99 € al año y planes mensuales para residencias." },
      { property: "og:title", content: "Planes — Grannytools Family" },
      { property: "og:description", content: "Qué incluye cada plan de Grannytools Family." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myPlanQuery),
  component: Planes,
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {(error as Error).message}</p>,
});

function List({ can, cannot }: { can: string[]; cannot: string[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {can.map((x) => <li key={x} className="flex gap-2"><span className="font-black text-primary">✓</span>{x}</li>)}
      {cannot.map((x) => <li key={x} className="flex gap-2 text-muted-foreground"><span className="font-black text-destructive">✕</span>{x}</li>)}
    </ul>
  );
}

function Checkout({ plan, quantity }: { plan: Plan; quantity: number }) {
  const create = useServerFn(createCheckoutSession);
  const fetchClientSecret = async () => {
    const r = await create({ data: { priceId: plan.id, quantity, environment: getStripeEnvironment(),
      returnUrl: `${window.location.origin}/family/planes?ok=1` } });
    if ("error" in r) throw new Error(r.error);
    return r.clientSecret;
  };
  return <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>;
}

function Planes() {
  const { ok } = Route.useSearch();
  const qc = useQueryClient();
  const { data: mine } = useSuspenseQuery(myPlanQuery);
  const portal = useServerFn(createPortalSession);
  const [pick, setPick] = useState<Plan | null>(null);
  const [qty, setQty] = useState(30);
  const [err, setErr] = useState("");

  // Tras pagar, el plan llega en unos segundos: refrescamos hasta verlo.
  useEffect(() => {
    if (!ok) return;
    const iv = setInterval(() => qc.invalidateQueries({ queryKey: ["family", "plan"] }), 3000);
    const to = setTimeout(() => clearInterval(iv), 30000);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [ok, qc]);

  const manage = async () => {
    setErr("");
    const w = window.open("", "_blank");
    const r = await portal({ data: { returnUrl: `${window.location.origin}/family/planes`, environment: getStripeEnvironment() } });
    if ("error" in r) { w?.close(); setErr(r.error); return; }
    if (w) w.location.href = r.url; else window.location.href = r.url;
  };

  const card = (p: Plan) => {
    const current = mine.priceId === p.id;
    return (
      <div key={p.id} className={`flex flex-col gap-3 rounded-3xl border-2 bg-card p-5 ${current ? "border-primary" : "border-border"}`}>
        <div>
          <p className="text-xl font-extrabold">{p.name}</p>
          <p className="text-sm text-muted-foreground">{p.for}</p>
        </div>
        <p><span className="text-3xl font-black">{p.price}</span> <span className="text-muted-foreground">{p.period}</span></p>
        <List can={p.can} cannot={p.cannot} />
        <div className="mt-auto">
          {current ? <p className="rounded-xl bg-primary/10 p-2 text-center font-bold text-primary">Tu plan actual</p>
            : <button onClick={() => { setErr(""); setPick(p); }} className="w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground">Contratar</button>}
        </div>
      </div>
    );
  };

  if (pick) {
    const per = pick.limit === "por persona";
    return (
      <FamilyShell title={`Contratar: ${pick.name}`}>
        <button onClick={() => setPick(null)} className="rounded-xl bg-secondary px-4 py-2 font-bold text-secondary-foreground">← Volver a los planes</button>
        <div className="rounded-3xl border-2 border-border bg-card p-5"><List can={pick.can} cannot={pick.cannot} /></div>
        {per && (
          <label className="block font-bold">Número de personas (mínimo 26):
            <input type="number" min={26} max={1000} value={qty} onChange={(e) => setQty(Math.max(26, Number(e.target.value) || 26))}
              className="ml-2 w-28 rounded-xl border-2 border-input bg-background px-3 py-2" />
            <span className="ml-2 font-normal">= {(qty * 1.5).toFixed(2).replace(".", ",")} € al mes</span>
          </label>
        )}
        {isTestPayments() && <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">Modo de prueba: usa la tarjeta 4242 4242 4242 4242, una fecha futura y cualquier CVC.</p>}
        <div className="rounded-3xl bg-card p-2"><Checkout key={`${pick.id}-${per ? qty : 1}`} plan={pick} quantity={per ? qty : 1} /></div>
      </FamilyShell>
    );
  }

  return (
    <FamilyShell title="Planes" wide>
      {ok && <p className="rounded-2xl bg-primary/10 p-4 font-bold text-primary">¡Gracias! Tu plan se activa en unos segundos.</p>}
      <div className="rounded-3xl border-2 border-border bg-card p-5">
        <p className="text-lg font-extrabold">Tu plan: {mine.name}</p>
        {mine.limit > 0 ? (
          <p>{mine.used} de {mine.limit} personas vinculadas{mine.until && ` · ${mine.cancelAtEnd ? "Termina" : "Se renueva"} el ${esDate(mine.until.slice(0, 10))}`}</p>
        ) : (
          <div className="mt-2"><p className="mb-2">Con la descarga gratuita puedes:</p><List can={DEMO_CAN} cannot={DEMO_CANNOT} /></div>
        )}
        {mine.limit > 0 && <button onClick={manage} className="mt-3 rounded-2xl bg-secondary px-5 py-3 font-bold text-secondary-foreground">Gestionar o dar de baja</button>}
        {err && <p className="mt-2 font-semibold text-destructive">{err}</p>}
      </div>
      <h2 className="text-2xl font-extrabold">Familias · pago anual</h2>
      <div className="grid gap-4 md:grid-cols-2">{PLANS.filter((p) => p.group === "familia").map(card)}</div>
      <h2 className="text-2xl font-extrabold">Empresas y residencias · pago mensual</h2>
      <div className="grid gap-4 md:grid-cols-3">{PLANS.filter((p) => p.group === "empresa").map(card)}</div>
      <p className="text-sm text-muted-foreground">Precios con impuestos incluidos según tu país. Puedes cambiar de plan o darte de baja cuando quieras desde «Gestionar o dar de baja».</p>
    </FamilyShell>
  );
}
