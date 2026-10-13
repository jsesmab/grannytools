import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, planLimit } from "@/lib/plans";
import { getStripeEnvironment } from "@/lib/stripe";

export const myPlanQuery = queryOptions({
  queryKey: ["family", "plan"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    const [{ data: subs }, { count }] = await Promise.all([
      supabase.from("subscriptions").select("price_id, quantity, status, current_period_end, cancel_at_period_end")
        .eq("user_id", uid).eq("environment", getStripeEnvironment()).order("created_at", { ascending: false }),
      supabase.from("elder_members").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);
    const { limit, plan } = planLimit(subs ?? []);
    const def = PLANS.find((p) => p.id === plan?.price_id);
    return {
      limit, used: count ?? 0, priceId: plan?.price_id ?? null, name: def?.name ?? "Sin plan (demo)",
      until: plan?.current_period_end ?? null,
      cancelAtEnd: !!(subs ?? []).find((s) => s.price_id === plan?.price_id)?.cancel_at_period_end,
    };
  },
});
