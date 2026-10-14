# gatherQuiiven — Agente principal (AGENTS.md)

> Clon web de Gather.town para Quiiven: oficina virtual 2D + audio/video espacial + zonas privadas + Smart Objects.
> Repo actual: VACÍO (solo `.git/`). Todo lo aquí definido es vinculante antes de escribir código.

## 1. Decisiones cerradas (2026-10-14)

- **Alcance objetivo:** Gather-like mínimo → mapa 2D + movimiento multiusuario + proximidad + zonas privadas + Smart Objects básicos. Pero **por etapas**, no todo a la vez.
- **Frontend juego:** React + TypeScript + PixiJS (WebGL, fallback Canvas 2D). UI (chat, paneles, videos) en React. Nada de animar avatares con DOM/CSS.
- **Backend estado:** Colyseus (Node.js) autoritativo, schemas + `patchRate`, delta binario. WebSocket/TCP solo para estado determinista (posición, chat, SDP, interacción).
- **Medios:** WebRTC/UDP vía SFU. Estrategia **a decidir en Fase 3** (LiveKit Cloud vs self-hosted). Fase 1-2: mock de proximidad (sin publicar media real).
- **Infra MVP:** AWS Lightsail (barato). `docker-compose` local = espejo de prod. Frontend estático + Colyseus en container.
- **Repo:** Monorepo pnpm + Turborepo: `apps/web`, `apps/server`, `packages/*`. Auth real (a definir proveedor — ver preguntas abiertas).
- **Idioma:** código y comentarios en inglés; docs y commits en español. Todo tipado estricto TS, ESM.

## 2. Arquitectura dual obligatoria (del PDF)

```
[PixiJS client] --WSS/TCP--> [Colyseus room] : x,y,anim,chat,zonas,SDP
[Web client]  --UDP/SRTP--> [SFU LiveKit*]   : audio/video (*Fase 3+)
```

- Nunca mezclar movimiento (TCP) con media (UDP). `HoL blocking` prohíbe TCP para voz/video.
- Audio espacial: `PannerNode` con `panningModel=equalpower` + `distanceModel=linear` (NO HRTF a escala). `positionZ=0`. Actualizar en `requestAnimationFrame`.
- Mapas en Tiled → `.tmj/.json` por capas (`ground`, `walls`, `roof`, `collision`, `zones`). Frustum culling por AABB vs viewport.
- Zonas privadas = polígonos en capa lógica → cambian reglas de subscribe (suprimen proximidad radial).
- Smart Objects = `iframe sandbox="allow-scripts"` SIN `allow-same-origin` + bus `postMessage` con validación `event.origin`.

## 3. Etapas vinculantes

- **Fase 0:** scaffolding monorepo + CI + Docker + lint/test. DoD: `pnpm dev` levanta web+server, `docker compose up` funciona.
- **Fase 1:** mapa Tiled demo + render PixiJS + avatar local (WASD/flechas) + colisiones + cámara sigue jugador.
- **Fase 2:** Colyseus `GameRoom`: join/spawn, broadcast x,y <100ms, interpolación, lista jugadores, chat global. Sin media.
- **Fase 2.5:** proximidad mock (distancia euclidiana, radio 3-5 tiles) + zonas privadas lógicas + culling. Sin WebRTC aún.
- **Fase 3:** LiveKit real + TURN (coturn, TURNS 443/5349, creds HMAC efímeras) + `PannerNode`. A decidir Cloud vs self.
- **Fase 4:** Smart Objects sandboxed + `postMessage` RPC + Egress/grabación (diferido).
- **Fase 5:** observabilidad, hardening, escalado Lightsail → ECS/K8s.

No saltar fases. Cada fase cierra con demo verificable en navegador.

## 4. Reglas de trabajo para agentes

1. Plan mode para diseño; Build solo tras plan aprobado.
2. Un paso a la vez, verificar con `pnpm build/test/lint` antes de avanzar.
3. Nunca crear archivos sin leer antes; preferir editar sobre crear.
4. Prohibido: secretos en repo, `allow-same-origin` en iframes, mover media por WebSocket, animar con DOM.
5. Todo cambio de red debe justificar TCP vs UDP.
6. Commits en español, pequeños y con test mínimo donde aplique.
7. Si falta dato (proveedor auth, dominio Lightsail, assets), preguntar con `question` tool, no adivinar.

## 5. Comandos esperados (cuando exista código)

- `pnpm install` / `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm lint`
- `docker compose up --build` (web + colyseus + redis futuro)
- Mapas en `apps/web/public/maps/*.tmj`, tilesets en `apps/web/public/tiles/`

## 6. Referencias

- `docs/PLAN_ETAPAS.md`, `docs/ARQUITECTURA.md`, `docs/DECISIONES_ABIERTAS.md`
- Skills: `.opencode/skills/*/SKILL.md`
- PDF base: "Análisis Técnico Exhaustivo y Arquitectura de Sistemas de Gather.town" (aportado por usuario, no versionado).
