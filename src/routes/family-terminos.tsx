import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { FamilyTerms } from "@/components/LegalTexts";

export const Route = createFileRoute("/family-terminos")({
  head: () => ({
    meta: [
      { title: "Términos de uso y contratación — Grannytools Family" },
      { name: "description", content: "Condiciones de uso y planes de pago de Grannytools Family." },
      { property: "og:title", content: "Términos — Grannytools Family" },
      { property: "og:description", content: "Uso, planes y contratación de Grannytools Family." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage family title="Términos de Grannytools Family"><FamilyTerms /></LegalPage>,
});
