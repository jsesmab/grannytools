import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.grannytools.family",
  appName: "Grannytools Family",
  webDir: "dist/client",
  android: { path: "native/family/android" },
  ios: { path: "native/family/ios" },
  // Family requires the hosted authenticated server; never starts the elder onboarding.
  server: { url: "https://grannytools.lovable.app/family", androidScheme: "https" },
};
export default config;