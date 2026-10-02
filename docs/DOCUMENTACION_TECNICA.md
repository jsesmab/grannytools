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
| `src/routes/pastillas.tsx` | Medicación, .ics y Google Calendar |
| `src/routes/citas.tsx` | Citas, turnos y tareas; `?view=citas|turnos|tareas|personas` (sin view = menú de 3 botones) |
| `src/lib/tasks.tsx`, `src/components/TasksPanel.tsx` | Modelo de tareas, `<TaskAlert/>` (montado en root) y panel de gestión |
| `src/routes/camara.tsx` | Cámara |
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
- `TILES` en orden fijo; `TILE_SHEET = {"/lupa":"lupa","/citas":"avisos","/pastillas":"avisos"}`; `SheetKey = "vista"|"voz"|"lupa"|"avisos"`.
- Modo ajustes: estado `showPrefs`; los tiles pasan a ser botones que abren su sheet.
- Botón Saludo alterna: si `speaking` → `cancel()`, si no → `speak()`. Sin Pausa/Parar. Tras saludar (`showCitas=false`) se muestra `<Link to="/citas" search={{view:"citas"}}>` con el nº de citas de hoy.
- Saludo: `speechSynthesis` con voz `es-*`; se dispara solo si `sessionStorage[greeted]` no existe. Clima vía Open-Meteo con cache diaria.
- Avisos: `Notification.requestPermission()` desde botón explícito (requisito iOS); prueba con oscilador 880 Hz + Notification + vibrate a los 5 s.

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
- Pastillas: `.ics` con `RRULE` (UNTIL si tiene fin); enlaces de Google Calendar; vencidas a histórico.
- Citas: turnos por días/horario, citas fijas o recurrentes con acompañante y recordatorio; barras diarias con asignación de carriles para solapes; edición vía `?edit=<id>`.

## 9b. Tareas
- `TaskAlert` comprueba cada 30 s; ventana de 2 min desde la hora; dedupe diario en `tareas.avisadas`; no salta si ya tiene estado. Evento `grannytools-tasks` refresca el panel.

## 10. Empaquetado
`npm run build` → `dist/client` → `npx cap add android && npx cap sync`. Detalles en `docs/CAPACITOR.md`.

## 11. Convenciones
- Documentación funcional y técnica se actualizan en el mismo cambio que el código.
- Nada de colores fijos; tokens semánticos.
- Lectura de `localStorage` siempre con try/catch y fuera del render SSR.
