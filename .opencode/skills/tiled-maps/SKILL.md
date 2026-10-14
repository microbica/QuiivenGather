---
name: tiled-maps
description: Convenciones de mapas Tiled .tmj para ground walls roof collision zones
license: MIT
compatibility: opencode
metadata:
  opencode/slash: "false"
---

## Capas obligatorias (nombres exactos)

- `ground`: suelo caminable, tiles 32x32.
- `walls`: decoración con colisión visual, no lógica.
- `collision`: rectángulos/objetos invisibles, `collides: true`. Única fuente de verdad para bloqueo.
- `roof`: dibujado encima del avatar (y-sort offset).
- `zones`: objetos polígono/rect con `type: private | spawn | interact`, `id`, `label`.
- `spawn`: punto `x,y` por defecto.

## Formato

- Tiled 1.10+, export `.tmj` (JSON) + tileset embebido o `tiles/*.tsx + *.png` 32x32.
- Ruta: `apps/web/public/maps/demo.tmj`, tiles en `apps/web/public/tiles/`.
- Propiedades custom por tile: `collides?: boolean`, `zoneId?: string`.

## Validación cliente

- Al cargar: parsear `collision` a grid booleano o lista AABB para `isBlocked(x,y)`.
- `zones` → array `{id, polygon:number[][], kind}` para test point-in-polygon cada 200ms (no por frame).
- Si falta capa, fallar con error explícito, no asumir.
