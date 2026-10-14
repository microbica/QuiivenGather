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

## Fase 2.5 — Proximidad mock + zonas (2-3 días)
- [ ] `useProximity(players, radiusTiles=5)`: distancia euclidiana, badge "en rango", lista "cerca de mí"
- [ ] Zonas `private`: si comparten `zoneId` → conectados; si no, suprime radial aunque estén cerca
- [ ] Culling red: no suscribir/renderizar avatares fuera de viewport + radio*2
- DoD: demo 3 avatares: 2 cerca conectados, 1 lejos no; entrar a zona privada aísla. Sin WebRTC.

## Fase 3 — Voz/video real (a planificar tras 2.5)
Requiere decidir: LiveKit Cloud vs self-hosted en Lightsail, dominio+TURN, proveedor auth cerrado.
- [ ] LiveKit + tokens JWT backend, subscribe por proximidad/zona
- [ ] coturn TURNS 443/5349 + HMAC efímero
- [ ] PannerNode equalpower/linear
- DoD: 2 usuarios cercanos se escuchan con volumen por distancia.

## Fase 4 — Smart Objects
- [ ] Registro `objects.json` (id, zoneId, url, w,h), iframe `sandbox="allow-scripts"` sin `allow-same-origin`
- [ ] Bus `postMessage` (`OBJECT_ENTER/LEAVE`, validación origin), modal React
- DoD: acercarse a TV abre iframe, alejarse lo pausa/cierra.

## Fase 5 — Prod Lightsail
- [ ] Compose prod, Caddy/Nginx TLS, backups, Datadog/Grafana básico, hardening TURN
- DoD: URL pública con 10 usuarios concurrentes estables.

Regla: no empezar fase N+1 sin DoD de N verificado en navegador.
