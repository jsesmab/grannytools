import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, OWNER } from "@/components/LegalPage";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de privacidad — Grannytools" },
      { name: "description", content: "Cómo tratan Grannytools y Grannytools Family tus datos personales y de salud (RGPD)." },
      { property: "og:title", content: "Política de privacidad — Grannytools" },
      { property: "og:description", content: "Tratamiento de datos en Grannytools y Grannytools Family." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage title="Política de privacidad">
      <h2>Responsable</h2>
      <p>{OWNER}</p>
      <h2>Qué datos tratamos</h2>
      <p><b>Grannytools (móvil del mayor):</b> nombre, contactos de ayuda, citas, tareas, medicinas y turnos. Se guardan en el propio teléfono. El audio y la cámara se procesan en el momento y <b>nunca se graban ni se envían</b>. La ubicación solo se usa para avisos de ayuda.</p>
      <p><b>Grannytools Family:</b> email y nombre de la cuenta, personas vinculadas y una copia de sus datos de agenda y medicación para que la familia pueda consultarlos. Los datos de salud (medicación, citas médicas) son categoría especial y se tratan con tu <b>consentimiento explícito</b> (art. 9.2.a RGPD).</p>
      <p><b>Pagos:</b> los gestiona Stripe; nunca vemos ni guardamos tu tarjeta.</p>
      <h2>Para qué</h2>
      <p>Prestar el servicio de ayuda, recordatorios y coordinación familiar, y gestionar la suscripción. No vendemos datos ni hacemos publicidad.</p>
      <h2>Cuánto tiempo</h2>
      <p>Mientras la cuenta esté activa. Al desvincular a una persona o borrar la cuenta se eliminan sus datos sincronizados. Las cuentas inactivas pausan la sincronización.</p>
      <h2>Encargados</h2>
      <p>Proveedor de alojamiento y base de datos en la nube (UE) y Stripe para cobros, con contratos de encargo del tratamiento.</p>
      <h2>Tus derechos</h2>
      <p>Acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo al email de contacto. Puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>
      <h2>Biometría</h2>
      <p>La huella o cara la comprueba el propio móvil; la app no recibe ni guarda datos biométricos.</p>
    </LegalPage>
  ),
});
