import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowedEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { PLANS } from "@/lib/plans";

const envSchema = z.enum(["sandbox", "live"]);

function checkEnv(env: "sandbox" | "live") {
  const host = new URL(getRequest().url).host;
  if (!allowedEnv(env, host)) throw new Error("Entorno de pago no permitido");
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    priceId: z.enum(PLANS.map((p) => p.id) as [string, ...string[]]),
    quantity: z.number().int().min(1).max(1000).default(1),
    returnUrl: z.string().url(),
    environment: envSchema,
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
    try {
      checkEnv(data.environment);
      const { data: u } = await context.supabase.auth.getUser();
      const email = u.user?.email ?? undefined;
      const userId = context.userId;
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Plan no encontrado");
      const price = prices.data[0];
      const quantity = data.priceId === "empresa_plus_monthly" ? Math.max(26, data.quantity) : 1;

      let customerId: string | undefined;
      const found = await stripe.customers.search({ query: `metadata['userId']:'${userId}'`, limit: 1 });
      if (found.data.length) customerId = found.data[0].id;
      else if (email) {
        const ex = await stripe.customers.list({ email, limit: 1 });
        if (ex.data.length) {
          customerId = ex.data[0].id;
          await stripe.customers.update(customerId, { metadata: { ...ex.data[0].metadata, userId } });
        }
      }
      if (!customerId) customerId = (await stripe.customers.create({ ...(email && { email }), metadata: { userId } })).id;

      // Precio con IVA incluido: el cliente paga exactamente lo anunciado.
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      const session = await stripe.checkout.sessions.create({
        line_items: [{
          quantity,
          price_data: {
            currency: price.currency,
            product: productId,
            unit_amount: price.unit_amount ?? 0,
            tax_behavior: "inclusive",
            recurring: { interval: price.recurring?.interval ?? "month", interval_count: price.recurring?.interval_count ?? 1 },
            metadata: { lovable_external_id: data.priceId },
          },
        }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        managed_payments: { enabled: true },
        metadata: { userId, managed_payments: "true" },
        subscription_data: { metadata: { userId } },
      } as any);
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ returnUrl: z.string().url(), environment: envSchema }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    try {
      checkEnv(data.environment);
      const { data: sub } = await context.supabase.from("subscriptions").select("stripe_customer_id")
        .eq("user_id", context.userId).eq("environment", data.environment)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!sub?.stripe_customer_id) return { error: "No tienes ningún plan contratado" };
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: data.returnUrl });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
