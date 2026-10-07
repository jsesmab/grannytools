- Emergencias pasan por src/lib/native-emergency.ts: web usa sms:/tel:, app de tienda usa plugin nativo DirectEmergency (sin confirmación en Android).

- Documentación: docs/DOCUMENTACION_FUNCIONAL.md y docs/DOCUMENTACION_TECNICA.md se actualizan en el mismo cambio que el código (mantener contexto para cualquier programador).

- Button styling is global in src/styles.css: controls use a solid 3D resting state and visibly depress on activation so new actions inherit accessible feedback.
- Agenda lock state lives in src/lib/care-lock.ts; screens read it via useCareLocked so a future Family sync can toggle it in one place.
- Family data sync: the elder phone authenticates with a device secret (no account) and pushes a full snapshot via `deviceSync`; Family reads it through RLS — keeps the elder app offline-first.
- Family writes go through server functions that verify the caller's admin role; tables are read-only for clients.
- Native packages use separate Capacitor configurations and platform directories selected by scripts/prepare-native.mjs so building one product never overwrites the other.
- Home widgets use a registered Capacitor bridge and native Android/WidgetKit sources; browsers only display installation guidance because web apps cannot pin native widgets.
- Web installation identity is selected in the root head from matched pathnames, including client-only Family routes and auth; never mutate installation tags in an effect, because installers need correct initial HTML and a single manifest.
