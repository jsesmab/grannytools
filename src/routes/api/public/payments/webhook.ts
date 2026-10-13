import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function row(sub: any, env: StripeEnv) {
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const ps = item?.current_period_start ?? sub.current_period_start;
  const pe = item?.current_period_end ?? sub.current_period_end;
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    product_id: typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id ?? "",
    price_id: priceId,
    quantity: item?.quantity ?? 1,
    status: sub.status,
    current_period_start: ps ? new Date(ps * 1000).toISOString() : null,
    current_period_end: pe ? new Date(pe * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || false,
    environment: env,
    updated_at: new Date().toISOString(),
  };
}

async function handle(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  const sub = event.data.object;
  const sb = await db();
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const userId = sub.metadata?.userId;
      if (!userId) { console.error("Suscripción sin userId"); return; }
      await sb.from("subscriptions").upsert({ user_id: userId, ...row(sub, env) }, { onConflict: "stripe_subscription_id" });
      break;
    }
    case "customer.subscription.deleted":
      await sb.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id).eq("environment", env);
      break;
    default:
      console.log("Evento no gestionado:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") return Response.json({ received: true, ignored: "invalid env" });
        try {
          await handle(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
