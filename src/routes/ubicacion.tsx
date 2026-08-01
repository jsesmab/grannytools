import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Send, AlertTriangle, MessageCircle } from "lucide-react";
import { type Contact, loadContacts, initials } from "@/lib/contacts";

export const Route = createFileRoute("/ubicacion")({
  head: () => ({
    meta: [
      { title: "Grannytools — Compartir ubicación" },
      { name: "description", content: "Envía tu ubicación exacta por mensaje o WhatsApp a uno de tus contactos de confianza." },
      { property: "og:title", content: "Grannytools — Compartir ubicación" },
      { property: "og:description", content: "Comparte dónde estás con un solo toque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ubicacion;
});

function Ubicacion() {
  return null;
}
