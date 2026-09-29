// Configuración para empaquetar Grannytools con Capacitor (Android / iOS).
// Pasos en docs/CAPACITOR.md.
const config = {
  appId: "com.grannytools.app",
  appName: "Grannytools",
  webDir: "dist/client",
  server: {
    // Para probar en el móvil cargando la web publicada, descomenta:
    // url: "https://grannytools.lovable.app",
    androidScheme: "https",
  },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_icon", iconColor: "#2563eb" },
  },
};

export default config;
