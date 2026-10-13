import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

// Clave pública de PRUEBA (no es secreta). Se usa mientras no se activen los pagos reales,
// para poder probar la contratación también en la web publicada y en el móvil.
const TEST_TOKEN = "pk_test_51UPo4tB3zeyvmhKlC51k7pIbNCKiySsWdXPGHTWgT8UPIfLG4ME7OJyVjl3gNqeZLVgLnZIwJQZBztBhSXMiEJQo00CpYUuO7y";
const clientToken: string = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN || TEST_TOKEN;

function paymentsEnvironment(): StripeEnv {
  if (clientToken.startsWith("pk_test_")) return "sandbox";
  if (clientToken.startsWith("pk_live_")) return "live";
  throw new Error("Los pagos no están configurados.");
}

let stripePromise: Promise<Stripe | null> | null = null;
export function getStripe() {
  if (!stripePromise) { paymentsEnvironment(); stripePromise = loadStripe(clientToken); }
  return stripePromise;
}
export const getStripeEnvironment = paymentsEnvironment;
export const isTestPayments = () => clientToken.startsWith("pk_test_");
