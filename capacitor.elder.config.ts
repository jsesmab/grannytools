import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.grannytools.app",
  appName: "Grannytools",
  webDir: "dist/client",
  android: { path: "native/elder/android" },
  ios: { path: "native/elder/ios" },
  server: { androidScheme: "https" },
};
export default config;