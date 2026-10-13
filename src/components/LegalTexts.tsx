import { OWNER } from "@/components/LegalPage";

export function GrannyTerms() {
  return (
    <>
      <h2>Titular</h2>
      <p>{OWNER}</p>
      <h2>Precio</h2>
      <p>Grannytools cuesta <b>4,99 € IVA incluido, en un único pago</b> en la tienda de aplicaciones. No hay suscripciones dentro de Grannytools.</p>
      <h2>Aviso importante de salud y emergencias</h2>
      <p><b>Grannytools no es un producto sanitario.</b> El amplificador no sustituye a un audífono ni al especialista. Los recordatorios de medicinas son una ayuda: sigue siempre a tu médico. El botón de pánico y el detector de caídas dependen del móvil, la batería y la cobertura y <b>no sustituyen al 112</b>.</p>
      <h2>Uso independiente</h2>
      <p>Sin vincular, Grannytools funciona sola en el móvil, en modo Autónomo, y todo lo que guardas se queda en el teléfono.</p>
      <h2>Uso vinculado con un familiar o cuidador</h2>
      <p>Si decides vincularte con Grannytools Family, la persona que te cuida podrá ver y cambiar tu agenda, medicinas y turnos, y activar el modo Protegido. Puedes pedir que te desvinculen cuando quieras.</p>
      <h2>Responsabilidad y ley aplicable</h2>
      <p>Ponemos los medios razonables para que funcione, sin garantizar disponibilidad continua. Ley española; para consumidores, los tribunales de su domicilio.</p>
    </>
  );
}

export function GrannyPrivacy() {
  return (
    <>
      <h2>Responsable</h2>
      <p>{OWNER}</p>
      <h2>Uso independiente</h2>
      <p>Tu nombre, contactos, citas, tareas, medicinas y turnos se guardan <b>solo en tu móvil</b>. No tenemos cuenta tuya ni recibimos esos datos. El audio y la cámara se procesan en el momento y <b>nunca se graban ni se envían</b>. La ubicación solo se usa para avisos de ayuda. La huella o cara la comprueba el propio móvil.</p>
      <h2>Uso vinculado</h2>
      <p>Solo si te vinculas con Grannytools Family, se envía una copia de tu agenda, medicinas y turnos a nuestro servidor (UE) para que tu familiar o cuidador la vea. Al desvincularte se borra esa copia.</p>
      <h2>Tus derechos</h2>
      <p>Acceso, rectificación, supresión, oposición, limitación y portabilidad en el email de contacto. Puedes reclamar ante la AEPD (aepd.es).</p>
    </>
  );
}

export function FamilyTerms() {
  return (
    <>
      <h2>Titular</h2>
      <p>{OWNER}</p>
      <h2>Uso</h2>
      <p>Grannytools Family se descarga gratis e incluye una demostración. Para vincular personas reales hay que contratar un plan. Quien vincula a una persona declara contar con su permiso o representación.</p>
      <h2>Planes y precios (IVA incluido)</h2>
      <p>Familia Básico 4,99 €/año (hasta 2 personas) · Familia Extendido 9,99 €/año (hasta 5) · Empresa 19,99 €/mes (hasta 10) · Empresa 39,99 €/mes (hasta 25) · más de 25: 1,50 €/persona/mes. Renovación automática; puedes cancelar desde «Gestionar o dar de baja» y el plan sigue activo hasta el final del periodo pagado.</p>
      <h2>Desistimiento</h2>
      <p>Tienes 14 días para desistir. Si desistes se descontará la parte ya disfrutada.</p>
      <h2>Una cuenta, un dispositivo</h2>
      <p>Cada cuenta solo puede estar abierta en un dispositivo a la vez.</p>
      <h2>Salud y emergencias</h2>
      <p>Family es una herramienta de coordinación, <b>no un servicio sanitario ni de emergencias</b>; no sustituye al 112.</p>
      <h2>Responsabilidad y ley aplicable</h2>
      <p>Medios razonables sin garantía de disponibilidad continua. Ley española; para consumidores, los tribunales de su domicilio.</p>
    </>
  );
}

export function FamilyPrivacy() {
  return (
    <>
      <h2>Responsable</h2>
      <p>{OWNER}</p>
      <h2>Qué datos tratamos</h2>
      <p>Email y nombre de tu cuenta, personas vinculadas y una copia de su agenda, medicinas y turnos. Los datos de salud son categoría especial y se tratan con tu <b>consentimiento explícito</b> (art. 9.2.a RGPD).</p>
      <p><b>Pagos:</b> los gestiona Stripe; nunca vemos tu tarjeta.</p>
      <h2>Para qué y cuánto tiempo</h2>
      <p>Coordinar el cuidado y gestionar la suscripción. No vendemos datos ni hacemos publicidad. Se guardan mientras la cuenta esté activa; al desvincular o borrar la cuenta se eliminan. Las cuentas inactivas pausan la sincronización.</p>
      <h2>Encargados</h2>
      <p>Alojamiento y base de datos en la nube (UE) y Stripe, con contratos de encargo.</p>
      <h2>Tus derechos</h2>
      <p>Acceso, rectificación, supresión, oposición, limitación y portabilidad en el email de contacto. Reclamaciones ante la AEPD (aepd.es).</p>
    </>
  );
}

export type LegalDoc = "granny-terms" | "granny-privacy" | "family-terms" | "family-privacy";
const DOCS: Record<LegalDoc, [string, () => React.JSX.Element]> = {
  "granny-terms": ["Términos de uso de Grannytools", GrannyTerms],
  "granny-privacy": ["Privacidad de Grannytools", GrannyPrivacy],
  "family-terms": ["Términos de Grannytools Family", FamilyTerms],
  "family-privacy": ["Privacidad de Grannytools Family", FamilyPrivacy],
};

export function LegalViewer({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const [title, Body] = DOCS[doc];
  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-background p-5 text-foreground">
      <article className="mx-auto max-w-2xl space-y-4 text-lg leading-relaxed [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold">
        <button type="button" onClick={onClose} className="rounded-2xl bg-primary px-5 py-3 text-lg font-bold text-primary-foreground">← Volver</button>
        <h1 className="text-3xl font-black">{title}</h1>
        <Body />
        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-primary py-4 text-xl font-bold text-primary-foreground">Cerrar</button>
      </article>
    </div>
  );
}
