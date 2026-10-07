# Grannytools — Documentación técnica

Guía de construcción para programadores. Se actualiza con cada cambio.

## 1. Stack
- TanStack Start v1 (React 19, SSR) + Vite 7. Rutas por fichero en `src/routes/`.
- Tailwind CSS v4 con tokens semánticos en `src/styles.css` (no colores fijos).
- Sin backend: todo en `localStorage`/`sessionStorage`. Destino: Android/iOS con Capacitor (`capacitor.config.ts`, guía en `docs/CAPACITOR.md`).
- PWA: `public/manifest.webmanifest`, iconos `icon-192/512.png`, `apple-touch-icon.png`.

## 2. Estructura
| Ruta / módulo | Función |
|---|---|
| `src/routes/__root.tsx` | Shell HTML, meta, monta `<AppReminders/>`, `<FallGuard/>`, `usePrefs()` |
| `src/routes/index.tsx` | Inicio: saludo por voz, tiles, Modo ajustes (sheets), clima |
| `src/routes/oir.tsx` + `src/lib/audio-engine.ts` | Amplificador |
| `src/routes/lupa.tsx` | Lupa |
| `src/routes/panico.tsx` + `src/lib/contacts.ts` | Contactos, alerta, contacto de emergencia |
| `src/routes/ubicacion.tsx` | Ubicación |
| `src/routes/pastillas.tsx` | Medicación y avisos con el reloj propio de la app |
| `src/routes/citas.tsx` | Citas, turnos y tareas; `?view=citas|turnos|tareas|personas` (sin view = menú de 3 botones) |
| `src/lib/tasks.tsx`, `src/components/TasksPanel.tsx` | Modelo de tareas, `<TaskAlert/>` (montado en root) y panel de gestión |
| `src/lib/prefs.ts`, `src/hooks/use-prefs.ts` | Accesibilidad (fontScale, highContrast, brightness) |
| `src/lib/reminders.tsx` | Avisos y badge |
| `src/lib/fall-detection.ts`, `src/lib/fall-guard.tsx` | Detector de caídas y overlay |
| `src/lib/native-emergency.ts` | Puente SMS/llamada web ↔ nativo |

Navegación interna siempre con `<Link to="/">` (nunca `<a href>`, que recarga y rompe el estado del saludo).

## 3. Claves de almacenamiento
| Clave | Almacén | Contenido |
|---|---|---|
| `grannytools.contacts` | local | `Contact[] {name, phone, photo?}` (migra claves legacy) |
| `grannytools.emergency` | local | Teléfono del contacto de emergencia |
| `grannytools.fall.enabled` | local | `"1"`/`"0"` |
| `grannytools.meds` | local | Medicinas (horas, from/until, crónico) |
| `grannytools.meds.tomadas` | local | `{"<YYYY-MM-DD local>|<med>|<HH:MM>": iso}` tomas marcadas; reminders las excluye del aviso y del badge |
| `grannytools.citas.people` / `.entries` / `.avisados` | local | Personas, citas/turnos, avisos ya disparados |
| `grannytools.prefs` | local | Accesibilidad |
| `grannytools.voz` | local | `{rate, volume}` del saludo |
| `grannytools.username` | local | Nombre del usuario |
| `grannytools.weather.today` | local | Previsión con fecha (cache offline del día) |
| `grannytools.tareas` | local | `Task[] {id,title,time,date?|days?}` |
| `grannytools.tareas.estado` | local | `{"<id>:<fecha>": "hecha"|"no"}` |
| `grannytools.tareas.avisadas` | local | Avisos de tarea ya mostrados hoy |
| `grannytools.greeted` | session | Saludo ya reproducido en esta apertura |

## 4. Inicio (`index.tsx`)
- `TILES` en orden fijo; `TILE_SHEET` enlaza Contactos con `caidas`, Lupa con `lupa`, y Citas/Pastillas con `avisos`; `SheetKey` incluye `vista|voz|lupa|avisos|caidas`.
- Modo ajustes: estado `showPrefs`; los tiles pasan a ser botones que abren su sheet.
- Botón Saludo alterna: si `speaking` → `cancel()`, si no → `speak()`. Sin Pausa/Parar. Tras saludar (`showCitas=false`) se muestra `<Link to="/citas" search={{view:"citas"}}>` con el nº de citas de hoy.
- Saludo: `speechSynthesis` con voz `es-*`; se dispara solo si `sessionStorage[greeted]` no existe. Clima vía Open-Meteo con cache diaria.
- Avisos: `Notification.requestPermission()` desde botón explícito (requisito iOS); prueba con oscilador 880 Hz + Notification + vibrate a los 5 s.
- Caídas: el panel de Contactos del modo ajustes lee y escribe `FALL_ENABLED_KEY`, solicita el permiso de movimiento al activar y ejecuta `simulateFall()` para la prueba.

## 5. Recordatorios (`reminders.tsx`)
- Polling cada 30 s. Dedupe por id (`med:<nombre>:<hora>`, citas en `citas.avisados`).
- Salida: voz, tono, vibración y Notification.
- Badge: `navigator.setAppBadge(pendientes)` = citas futuras de hoy + tomas futuras; `clearAppBadge` si 0.
- En tiendas: sustituir por `@capacitor/local-notifications` programadas (funcionan con la app cerrada).

## 6. Amplificador (`audio-engine.ts`)
Cadena Web Audio: micrófono → RNNoise (WASM) → puerta de ruido → EQ (graves/medios/agudos) → compresión multibanda → pasa-bajos 7 kHz → ganancia (hasta +40 dB, Turbo +15) → limitador → salida. Silero VAD para Anti-Retorno y atenuación de voz propia. `sessionId` evita condiciones de carrera al reiniciar. Wake Lock activo.

## 7. Detector de caídas
- Algoritmo (`createFallDetector`) en 3 fases: caída libre < 0,5 g (120–900 ms) → impacto > 3 g → inmovilidad |g−1| < 0,35 durante 1,5 s. Tras disparar, se desarma 10 s.
- Entrada web: `devicemotion` (`accelerationIncludingGravity`). iOS exige `DeviceMotionEvent.requestPermission()` desde un toque.
- Entrada nativa: llamar a `pushAcceleration(x,y,z)` desde `@capacitor/motion` o servicio en primer plano.
- `FallGuard` sincroniza cada 3 s con `isFallEnabled()`; overlay con `AlarmTone`, voz, vibración, cuenta atrás `FALL_COUNTDOWN_SEC = 30`. `simulateFall()` para pruebas.
- Al llegar a 0: `sendEmergency(phone)` → ubicación (`currentLocationLink`, Google Maps) → `emergencySms` → `emergencyCall` (1 s en nativo, 2,5 s en web).

La gestión visual de contactos mantiene dos modos: normal (solo fotos; tocar llama) y ajustes (solo estrella y borrar sobre las fotos). Tocar una foto en ajustes abre un único formulario reutilizado para altas y modificaciones; el botón superior «Nuevo contacto» sustituye a «ALERTA» mientras los ajustes están abiertos.

## 8. Puente de emergencia (`native-emergency.ts`)
- Web: `sms:` y `tel:` (el sistema pide confirmar).
- Nativo: `window.Capacitor.Plugins.DirectEmergency.sendSms({phone,text})` y `.call({phone})`; si falla, cae a web.
- Plugin Java y permisos: ver `docs/CAPACITOR.md`. iOS no permite envío/llamada sin confirmación.

## 9. Pastillas y citas
- Pastillas: avisos con el reloj propio de la app (sin calendarios externos); tomas marcadas en `grannytools.meds.tomadas`; vencidas a histórico. En la app de tiendas los avisos con la app cerrada usarán notificaciones locales nativas.
- Vista de Pastillas: cronograma lineal agrupando las tomas activas de hoy por hora (`Map<hora, Med[]>`, orden ascendente). Sin borrado ni botón de permiso de avisos en esta pantalla (borrado reservado a la futura versión familiar; permiso en Ajustes de inicio).
- Citas: turnos por días/horario, citas fijas o recurrentes con acompañante y recordatorio; barras diarias con asignación de carriles para solapes; edición vía `?edit=<id>`. En citas `personId` es opcional y se usa `who` (texto libre); `entryWho(e)` resuelve el nombre mostrado (`who` → nombre de la persona del turno → vacío). Citas antiguas con `personId` se muestran como texto editable al editarlas.

## 9b. Tareas
- `TaskAlert` comprueba cada 30 s; ventana de 2 min desde la hora; dedupe diario en `tareas.avisadas`; no salta si ya tiene estado. Evento `grannytools-tasks` refresca el panel.

## 10. Empaquetado
`npm run build` → `dist/client` → `npm run cap:elder -- android` o `npm run cap:family -- android` (también `ios`). Configuraciones separadas en `capacitor.elder.config.ts` y `capacitor.family.config.ts`, seleccionadas desde `capacitor.config.ts` por `GRANNYTOOLS_APP`. Directorios nativos independientes. Detalles y pendientes de release en `docs/CAPACITOR.md`.

### Widget de icono gigante
- `src/lib/home-widget.ts`: `registerPlugin("HomeWidget")`, comprueba soporte de anclaje antes de solicitarlo. No interpreta la solicitud como instalación confirmada.
- `HomeWidgetOffer` en permisos de Onboarding: petición opcional, mensajes de fallo/no soporte, guía manual iOS y alternativa web. Sin acceso en el alta de Family.
- `native/elder/widget/android`: proveedor RemoteViews con ImageView única e icono existente; PendingIntent inmutable que abre MainActivity. XML propone `targetCellWidth/Height=4`, fallback 250dp y permite redimensionar. Sin polling, datos personales ni permiso especial.
- `scripts/prepare-native.mjs`: herramienta local de empaquetado (nunca importada en servidor); añade/sincroniza plataforma e instala idempotentemente el widget, receiver y registro del plugin Android.
- `native/elder/widget/ios/GrannytoolsWidget.swift`: fuente WidgetKit para extensión iOS 17+, `.systemLarge`, imagen y URL `grannytools://open`. Requiere target de extensión, imagen, esquema URL y firma en Xcode; no se crea por Capacitor automáticamente.
- Family usa inicialmente el sitio publicado `/family`; no debe considerarse un paquete offline completo ni listo para aprobación de tiendas. Revisar navegación OAuth en WebView, biometría, persistencia segura y política de tiendas antes de release.

## 11. Convenciones
- Documentación funcional y técnica se actualizan en el mismo cambio que el código.
- Nada de colores fijos; tokens semánticos.
- Los botones y enlaces con fondo reciben globalmente volumen 3D y desplazamiento de pulsación desde `src/styles.css`; `data-flat-button` queda reservado para superficies interactivas que no deban parecer una tecla.
- Lectura de `localStorage` siempre con try/catch y fuera del render SSR.

## Bloqueo de agenda (`src/lib/care-lock.ts`)
`localStorage grannytools.careMode` = `autonomo` (defecto) | `protegido`; `.source` = `local` | `family`. `setCareMode(mode, source)` emite el evento `grannytools:caremode`; `useCareLocked()` lo escucha (también `storage`). Consumidores: `citas.tsx` (guardas en `openNew`/`openEdit`, oculta botones y Personas, `fieldset disabled` en TasksPanel), `pastillas.tsx` (oculta «Añadir medicina»), selector en ajustes de `index.tsx`. La app Family deberá llamar a `setCareMode(..., "family")` al sincronizar.
En modo protegido, citas, turnos y tareas se abren en solo lectura: formulario dentro de `<fieldset disabled>`, título «Datos de…», solo botón «Cerrar» (sin Guardar/Borrar). `TasksPanel` recibe `locked`.

## Bienvenida y vinculación
- `src/components/Onboarding.tsx` (montado en root): overlay si falta `localStorage grannytools.onboarded`. Pide permisos con gesto del usuario (geolocation, Notification, getUserMedia, `requestMotionPermission` + `setFallEnabled`). Guarda `grannytools.username`, contacto en `grannytools.contacts` y `setEmergencyPhone`.
- `src/lib/family-link.ts`: `grannytools.deviceId` (UUID), `grannytools.link.code` (`GT-` + 6 chars), `grannytools.link.family` `{name, at}`. Payload QR: `{app:"grannytools",v:1,device,code}`. La app Family/sincronización deberá llamar a `markLinked(nombre)`; `unlink()` regenera código. Evento `grannytools:link`.
- `src/routes/vincular.tsx`: QR con `qrcode.react`. Aún sin backend de emparejamiento.

## Vinculación Family (src/lib/family-link.ts)
- `getInvite(renew)`: invitación `{code, secret, expires}` (TTL 10 min) en `grannytools.link.invite`; payload QR v2 `{app, v:2, device, code, secret, exp}`. El servidor Family deberá validar secreto, caducidad y uso único.
- Miembros en `grannytools.link.members`: `{id, name, role: "admin"|"consulta", at}`. API: `addFamilyMember` (consume la invitación), `setMemberRole`, `removeFamilyMember`; evento `grannytools:link`.
- `/vincular` muestra QR, cuenta atrás, lista de miembros; botón de simulación solo en desarrollo.

## 12. Grannytools Family (fase 1)
- Backend en Lovable Cloud. Tablas: `profiles` (familiar: nombre, teléfono, foto), `elders` (persona mayor: nombre, `care_mode` + `care_mode_at`, `snapshot` jsonb, `last_sync`), `elder_members` (N:M familiar↔persona, `role` admin|consulta), `elder_devices` (secreto del teléfono, hash SHA-256, solo servidor), `elder_invites` (código GT-XXXXXX, caduca, uso único, solo servidor).
- RLS: un familiar solo lee `elders`/`elder_members` de personas a las que está vinculado (`is_elder_member`). Las escrituras pasan por funciones de servidor en `src/lib/family.functions.ts`.
- Teléfono del mayor (sin cuenta): `src/lib/family-sync.ts` → `deviceSync` cada 2 h en reposo (`IDLE_SYNC_MS`) y al instante al abrir o volver a la app (`visibilitychange`), al recuperar red y al marcar pastillas o tareas; envía snapshot (medicinas, tomas, citas, turnos, tareas, contactos sin foto) y la invitación vigente; recibe modo de uso (gana el `care_mode_at` más reciente) y familiares. `deviceMemberAction` cambia rol/desvincula desde `/vincular`.
- Family: `/auth` (email + Google), `_authenticated/` con `/family` (Mis personas), `/family/hoy` (panel de ordenador con todas las personas por hora y «Sin marcar»), `/family/persona/$id` (ficha, modo de uso, familia vinculada), `/family/vincular` (canjea código; el primero es Administrador), `/family/perfil`.
- En `/family` y `/auth` el root no monta avisos, caídas, bienvenida ni sincronización del mayor.
- Fase 2: `familyChange` (solo Administrador) guarda cambios en `elder_changes` (kind med|cita|task, op upsert|delete, item_key = name de medicina o id). `deviceSync` los entrega una vez (marca `applied_at`) y `applyChanges` en `family-sync.ts` los escribe en localStorage y vuelve a sincronizar. UI: `src/components/FamilyEditor.tsx` en la ficha (pendientes visibles). Escáner QR: `src/components/QrScanner.tsx` (jsqr, cámara trasera) en `/family/vincular`.
- Vista hoy/semana: estado local `range` en `src/routes/citas.tsx` (RangeToggle) y `src/components/TasksPanel.tsx`; por defecto "hoy".
- Huella / Face ID (Family): `src/lib/biometrics.ts`. Interruptor en `/family/perfil` (`grannytools.family.biometric`); `FamilyShell` muestra pantalla de bloqueo si está activado y no se ha desbloqueado en esta apertura (`sessionStorage grannytools.family.unlocked`). La sesión sigue siendo la de Lovable Cloud; la huella solo desbloquea. Solo en app nativa (plugin BiometricAuth). Guía en `docs/CAPACITOR.md` §6.

## Vista de agenda (citas.tsx / TasksPanel.tsx)
- Sin barras horarias: `Timeline` en citas.tsx ahora pinta tarjetas detalladas. Semana = lunes a domingo de la semana actual, estado `openDays` (ISO) para desplegar varios días.

## Family: lista desplegable
`family.index.tsx` lista nombres con acordeón; reutiliza `FamilyEditor` (secciones colapsables en orden task, med, turno, cita; "turno" = entrada `periodica` enviada con kind `cita` en `familyChange`) y `FamilyMembers` (componente compartido con la ficha `/family/persona/$id`).

## dayItems (src/lib/family-data.ts)
- Coincidencia por `date` si existe, si no por `days` (independiente de `kind`); horas normalizadas con `normTime`.
- `DayItem.info: string[]` con el detalle completo; family.hoy lo muestra siempre en `lg` y plegable en móvil.
- pastillas.tsx: `vigencia(m)` muestra fecha fin y días restantes; sección «Mis tratamientos».

## Autoridad del modo de uso
deviceSync ya no acepta el care_mode enviado por el teléfono. Si el mayor no tiene elder_members, el servidor fuerza "autonomo"; si tiene, solo setElderCareMode (Administrador) lo cambia. En Ajustes del mayor el modo es de solo lectura.


## Límite de plan
`redeemInvite` cuenta las filas de `elder_members` del usuario; si ya tiene 2 y el código es de otra persona, devuelve `ok:false` con mensaje de plan profesional. La suscripción profesional queda pendiente.

## Pausa por inactividad de Family
- `elder_members.last_active_at`: `familyHeartbeat` (montado en `FamilyShell`) lo actualiza como mucho una vez por hora.
- `deviceSync` devuelve `paused=true` si la persona tiene familiares y ninguno ha abierto Family en 30 días (`INACTIVE_MS`). Sin familiares no se pausa (necesita publicar la invitación).
- Teléfono: `grannytools.syncPaused`; en pausa solo sincroniza una vez al día. `requestSync()` (p. ej. desde Vincular) y los cambios recibidos fuerzan la sincronización. Al volver un familiar, la siguiente comprobación diaria la reactiva.

## Manifiesto web de Family
`public/family.webmanifest` usa id/start_url `/family` y scope `/family`; iconos `family-icon-192/512.png`, `family-apple-touch-icon.png`. `manifest.webmanifest` conserva `id: "/"`.

`__root.tsx` selecciona la identidad de instalación en `head({ matches })` según los pathnames `/family`, `/family/*` y `/auth`: un único manifiesto, favicons, apple-touch-icon, título de instalación y color. La selección pertenece al HTML inicial y a la navegación del router, no a un `useEffect`; así funciona también cuando el layout autenticado es `ssr:false`, sin cambiar sus guardas. `/auth` está fuera del scope de Family y puede mostrarse fuera de la ventana instalada según el navegador; tras iniciar sesión vuelve a `/family`.

`auth.tsx` y `FamilyShell.tsx` muestran el icono existente de Family a 112 × 112 antes de las opciones (incluido el desbloqueo biométrico). Validar el HTML sin JavaScript de `/family` y `/auth`, y volver a instalar en un dispositivo real después de publicar; una instalación antigua puede conservar su identidad en caché.
