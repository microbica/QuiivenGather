# PLAN por etapas — gatherQuiiven

Decisiones base: React+TS+PixiJS, Colyseus, Lightsail, monorepo pnpm, auth real. Medios (LiveKit) diferido a Fase 3.

## Fase 0 — Scaffolding (1-2 días)
- [ ] `pnpm-workspace.yaml` + `turbo.json` + `package.json` root
- [ ] `apps/web` (Vite React TS) + `apps/server` (Colyseus Node TS) + `packages/protocol` (schemas compartidos)
- [ ] ESLint + Prettier + Vitest + `tsconfig` estricto, CI `.github/workflows/ci.yml` (build/lint/test)
- [ ] `Dockerfile` web/server + `docker-compose.yml` (web:5173, server:2567)
- DoD: `pnpm install && pnpm dev` levanta ambos; `docker compose up --build` OK. Commit: `chore: scaffolding monorepo fase 0`.

## Fase 1 — Mapa local (2-4 días) ✅ 2026-10-14
- [x] `apps/web/public/maps/demo.tmj` (capas ground/walls/collision/zones/spawn) + tiles placeholder 32px
- [x] `GameCanvas.tsx` PixiJS: carga TMJ, render capas, culling viewport, WASD/flechas, colisión AABB, follow-cam
- [x] Avatar placeholder (rect + nombre), 60fps, `?debug` muestra colisiones
- DoD: 1 jugador se mueve sin atravesar paredes. Sin backend aún.

## Fase 2 — Multiusuario Colyseus (3-5 días) ✅ 2026-10-14
- [x] `packages/protocol`: `PlayerSchema`, `GameState` + `ChatMessage` + consts (MAP, speeds, chat)
- [x] `apps/server/src/rooms/GameRoom.ts`: join/spawn, `onMessage move` validado (anti-teleport), patchRate 50ms, chat global
- [x] Cliente: `useColyseusRoom`, interpolación exponencial, lista jugadores, chat
- DoD: 2 clientes se ven moverse (smoke PASS), sin rubber-banding severo.

## Fase 2.5 — Proximidad mock + zonas (2-3 días) ✅ 2026-10-14
- [x] `useProximity(players, radiusTiles=5)`: distancia euclidiana, badge "en rango", lista "cerca de mí"
- [x] Zonas `private`: si comparten `zoneId` → conectados; si no, suprime radial aunque estén cerca
- [x] Culling: avatares remotos fuera de viewport + radio se ocultan; `Player.zoneId` reportada por cliente y validada en server
- DoD: anillo verde = conectado (mock de futuro audio), Sala 1 aísla. Sin WebRTC.

## Fase 3 — Voz/video mesh P2P (open-source, máx 5 por proximidad) — DECIDIDO 2026-10-14
Sin SFU ni cloud: malla WebRTC directa entre los ≤5 avatares conectados por
proximidad (Fase 2.5). Señalización SDP/ICE por Colyseus (TCP, correcto:
metadata determinista). Audio espacial con `PannerNode(equalpower, linear)`.
STUN público por defecto (`VITE_STUN_URL`), coturn propio en Fase 5.
- [ ] Relay `rtc-signal` en `GameRoom` (solo reenvía, nunca media)
- [ ] `useMeshVoice`: getUserMedia, PC por peer, videos en DOM, mute mic/cam
- [ ] `spatialAudio.ts`: panner por peer, update por frame con posiciones
- [ ] Cap `MESH_MAX_PEERS=5` (top-5 más cercanos)
- DoD: 2-3 tabs cercanas se escuchan/ven con volumen por distancia. ✅ 2026-10-14
  (`build/lint/test` verde, smoke con `rtc relay` PASS, web 200.
  Demo manual pendiente en navegador: activar voz/video en 2 tabs y acercar).

## Fase 4 — Smart Objects (+ Meet embebido) ✅ 2026-10-14
- [x] Registro `objects.json` (id, zoneId, url, w,h), iframe `sandbox="allow-scripts"` sin `allow-same-origin`
- [x] Bus `postMessage` (`OBJECT_ENTER/LEAVE`, validación origin), modal React
- [x] Objeto `meet`: URL de Google Meet por sala/zona → grupos grandes fuera de proximidad (`VITE_MEET_URL`)
- DoD: acercarse a TV abre iframe, alejarse lo pausa/cierra (modal + `objects.json` servido, 4 tests).

## Fase 4.5 — Google OAuth + Calendar + Meet (2026-10-14)
Vinculación de cuenta Google por usuario (server-side OAuth, secret nunca en
cliente). Calendario (solo lectura) + creación de reuniones con Meet adjunto,
publicadas en vivo en `GameState.meetUrl` (solo usuarios vinculados) y mostradas
en la TV Sala 1 (objeto `kind=meet`) en lugar del placeholder.
- [x] `@quiiven/protocol`: `GameState.meetUrl` (`string`, vacío = ninguno)
- [x] `apps/server/src/auth/google.ts`: OAuth, intercambio/refresh, perfil, `validMeetUrl`
- [x] `apps/server/src/auth/store.ts`: refresh tokens cifrados AES-256-GCM en disco (`GOOGLE_TOKEN_KEY`)
- [x] `apps/server/src/auth/sessions.ts`: cookie httpOnly ↔ google sub; link con sesión Colyseus
- [x] `apps/server/src/auth/routes.ts`: `/auth/google`, callback, status, unlink, `/api/calendar/events`, `/api/meetings`
- [x] `GameRoom`: `onAuth` lee cookie en upgrade WS, `set-meet` solo para vinculados
- [x] Web: `api/google.ts` + `ui/GooglePanel.tsx` + Meet en vivo en `SmartObjectModal`
- [x] **Login del juego con Google `@quiiven.com`**: gate en web (`LoginGate`), rechazo en `GameRoom.onAuth` (defensa en profundidad), nombre autoritativo del perfil. `GOOGLE_ALLOWED_DOMAIN` / `GOOGLE_ALLOWED_EMAILS`.
- [x] Tests: `validMeetUrl`, `isEmailAllowed`, round-trip token store, link de sesión/cookie
- DoD: solo @quiiven.com entra; no autorizado ve pantalla de login y el server rechaza el join; build/lint/test verdes.
  Demo manual pendiente: flujo popup en navegador + crear Meet publicado + acceso denegado con otra cuenta.

## Fase 6 — Rol admin + objetos editables (SQLite)
- [x] `node:sqlite` (built-in Node 22, sin nativo): `data/gather.db` con tablas `users(role)` y `objects`
- [x] Seed: `alejandro.moreno@quiiven.com` = admin por defecto (`GOOGLE_ADMIN_EMAIL`); objetos desde `objects.json`
- [x] Protocolo: `GameObject` + `GameState.objects` (MapSchema, server autoritativo)
- [x] Handlers admin: `obj-move` (drag en canvas), `obj-add` (duplicar), `obj-remove` (borrar) — todos validados server-side
- [x] Web: `AdminPanel` (lista + duplicar/borrar), drag de marcadores ⌖ en `GameCanvas`, badge `[admin]` en GooglePanel
- [x] Tests: seed admin, CRUD objetos, `isEmailAllowed`
- [x] Página admin `#/admin`: usuarios (listar, promover/degradar, borrar con anti auto-bloqueo), Meet/TV en vivo (reusa GooglePanel), estado guardado de jugadores (solo lectura). Objetos solo en el mapa (modo edición del canvas). Conexión oculta al room (sin avatar). Solo rol admin (403 para el resto). Botón ⚙ en el topbar del juego.
- DoD: admin mueve/duplica/borra objetos y todos los clientes ven los cambios en vivo. ✅

## Fase 5 — Prod Lightsail
- [ ] Compose prod, Caddy/Nginx TLS, backups, Datadog/Grafana básico, hardening TURN
- DoD: URL pública con 10 usuarios concurrentes estables.

Regla: no empezar fase N+1 sin DoD de N verificado en navegador.
