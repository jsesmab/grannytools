import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { FamilyPrivacy } from "@/components/LegalTexts";

export const Route = createFileRoute("/family-privacidad")({
  head: () => ({
    meta: [
      { title: "Política de privacidad — Grannytools Family" },
      { name: "description", content: "Cómo trata Grannytools Family los datos de tu cuenta y de las personas vinculadas (RGPD)." },
      { property: "og:title", content: "Privacidad — Grannytools Family" },
      { property: "og:description", content: "Tratamiento de datos en Grannytools Family." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage family title="Privacidad de Grannytools Family"><FamilyPrivacy /></LegalPage>,
});
