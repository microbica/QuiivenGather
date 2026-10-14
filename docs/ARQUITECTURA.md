# ARQUITECTURA — gatherQuiiven (resumen PDF)

## Red dual
- **TCP/TLS (WSS):** Colyseus. Posiciones (15-20Hz), chat, join/leave, SDP signaling, interacción objetos. Tolera 100-200ms (interpolación oculta).
- **UDP/SRTP (WebRTC):** solo audio/video vía SFU (Fase 3+). Nunca por WebSocket (HoL blocking).

## Estado (Colyseus)
- Servidor autoritativo Node. `Player {x,y,dir,anim}` + `MapSchema`. Deltas binarios cada 50ms.
- Validación: clamp velocidad, check colisión server-side (carga TMJ collision en server o grid simplificado).
- Escala futura: Redis presence + spatial hash/quadtree por salas. MVP: 1 room <50 usuarios.

## Cliente
- React para UI (chat, roster, modales). PixiJS 8 para mundo: containers por capa, Y-sort, `roundPixels`, culling AABB.
- Ticker: input → predict local → envía `move` 15Hz → render + interpola remotos. Proximidad cada 200ms, no por frame.
- Mapas Tiled `.tmj`: `ground, walls, roof, collision, zones`.

## Medios (Fase 3)
- SFU LiveKit (star): 1 publish por cliente, simulcast, subscribe dinámico por distancia/zona.
- Audio: `PannerNode(equalpower, linear)`, `positionZ=0`, `maxDistance=5 tiles`, update en rAF.
- NAT: STUN + coturn TURNS 443/5349, creds HMAC TTL corto, blacklist RFC1918 + 169.254.169.254.

## Smart Objects (Fase 4)
- `iframe sandbox="allow-scripts"` (jamás `allow-same-origin`). `postMessage` JSON `{type, payload}` + check `event.origin` en ambos lados.

## Infra
- Local: `docker-compose` (web + server + [redis]).
- Prod MVP: 1x Lightsail 2-4GB (Docker), Caddy TLS. Escala: split server juego vs SFU/TURN.
