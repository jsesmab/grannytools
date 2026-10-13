import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, OWNER } from "@/components/LegalPage";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos de uso y contratación — Grannytools" },
      { name: "description", content: "Condiciones de uso de Grannytools y de contratación de los planes de Grannytools Family." },
      { property: "og:title", content: "Términos de uso — Grannytools" },
      { property: "og:description", content: "Condiciones de uso y contratación de Grannytools y Family." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage title="Términos de uso y contratación">
      <h2>Titular</h2>
      <p>{OWNER}</p>
      <h2>Aviso importante de salud y emergencias</h2>
      <p><b>Grannytools no es un producto sanitario.</b> El amplificador no sustituye a un audífono ni a la revisión de un especialista. Los recordatorios de medicinas son una ayuda: sigue siempre las indicaciones de tu médico. El botón de pánico y el detector de caídas dependen del móvil, la batería y la cobertura y <b>no sustituyen al 112</b>.</p>
      <h2>Uso</h2>
      <p>Grannytools se descarga gratis. Grannytools Family se descarga gratis con una demostración; vincular personas reales requiere un plan. Quien vincula a una persona declara contar con su permiso o representación.</p>
      <h2>Planes y precios (IVA incluido)</h2>
      <p>Familia Básico 4,99 €/año (hasta 2 personas) · Familia Extendido 9,99 €/año (hasta 5) · Empresa 19,99 €/mes (hasta 10) · Empresa 39,99 €/mes (hasta 25) · más de 25: 1,50 €/persona/mes. Renovación automática al final de cada periodo; puedes cancelar cuando quieras desde «Gestionar o dar de baja» y el plan sigue activo hasta que acabe el periodo pagado.</p>
      <h2>Desistimiento</h2>
      <p>Tienes 14 días para desistir. Al contratar pides que el servicio empiece de inmediato; si desistes se descontará la parte ya disfrutada.</p>
      <h2>Una cuenta, un dispositivo</h2>
      <p>Cada cuenta de Family solo puede estar abierta en un dispositivo a la vez.</p>
      <h2>Responsabilidad</h2>
      <p>Ponemos los medios razonables para que el servicio funcione, sin garantizar disponibilidad continua. No respondemos de daños por fallos del móvil, la red o un uso contrario a estos términos.</p>
      <h2>Ley aplicable</h2>
      <p>Ley española. Para consumidores, los tribunales de su domicilio.</p>
    </LegalPage>
  ),
});
