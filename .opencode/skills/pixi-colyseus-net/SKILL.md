---
name: pixi-colyseus-net
description: Patrones PixiJS + Colyseus para movimiento multiusuario y culling
license: MIT
compatibility: opencode
metadata:
  opencode/slash: "false"
---

## PixiJS (v8)

- `Application.init({ resizeTo: canvasParent, background, antialias: false })`, sprites con `roundPixels: true`.
- Capas: `groundContainer < objectsContainer < avatarContainer < roofContainer`. Orden Y-sort en avatar+objects.
- Tiles: precargar spritesheet (Assets.load), instanciar solo tiles en viewport + 1 tile margen. Culling manual: `sprite.visible = aabbIntersects(viewport)`.
- Input: WASD + flechas, velocidad px/s fija (ej. 160), normalizar diagonal. Colisión AABB contra capa `collision` antes de aplicar.
- Cámara: `world.pivot = player + lerp(0.12)`, clamp a bounds del mapa.

## Colyseus

- Schema: `Player { x:number, y:number, dir:string, anim:string, name:string }`, `State { players: MapSchema<Player>, chat: ArraySchema }`.
- Server: `GameRoom onJoin → spawn random libre`, `onMessage('move', validate vs collision+speedhack)`, `setPatchRate(50)` (20Hz).
- Client: `room.state.players.onAdd/onRemove`, interpolación: guardar `targetX/Y` + lerp en ticker. Enviar `move` a 15Hz, no por frame.
- Latencia objetivo <100ms en LAN; medir con `room → ping`.

## Anti-patterns

- No `useState` React por frame para posiciones; usar refs + ticker Pixi.
- No broadcast JSON completo; usar schemas.
- No mover media por Colyseus.
