import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { GrannyPrivacy } from "@/components/LegalTexts";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de privacidad — Grannytools" },
      { name: "description", content: "Cómo trata Grannytools tus datos, usada sola o vinculada con un familiar (RGPD)." },
      { property: "og:title", content: "Política de privacidad — Grannytools" },
      { property: "og:description", content: "Datos locales y sincronización voluntaria en Grannytools." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage title="Privacidad de Grannytools"><GrannyPrivacy /></LegalPage>,
});
