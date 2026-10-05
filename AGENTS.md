- Emergencias pasan por src/lib/native-emergency.ts: web usa sms:/tel:, app de tienda usa plugin nativo DirectEmergency (sin confirmación en Android).

- Documentación: docs/DOCUMENTACION_FUNCIONAL.md y docs/DOCUMENTACION_TECNICA.md se actualizan en el mismo cambio que el código (mantener contexto para cualquier programador).

- Button styling is global in src/styles.css: controls use a solid 3D resting state and visibly depress on activation so new actions inherit accessible feedback.
- Agenda lock state lives in src/lib/care-lock.ts; screens read it via useCareLocked so a future Family sync can toggle it in one place.
