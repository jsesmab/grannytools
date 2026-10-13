import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { GrannyTerms } from "@/components/LegalTexts";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos de uso — Grannytools" },
      { name: "description", content: "Condiciones de uso de Grannytools: pago único de 4,99 € IVA incluido, uso independiente o vinculado." },
      { property: "og:title", content: "Términos de uso — Grannytools" },
      { property: "og:description", content: "Condiciones de uso de Grannytools." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage title="Términos de uso de Grannytools"><GrannyTerms /></LegalPage>,
});
