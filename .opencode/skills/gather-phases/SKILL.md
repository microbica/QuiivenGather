---
name: gather-phases
description: Workflow por etapas obligatorias Fase 0 a Fase 5 con DoD verificable
license: MIT
compatibility: opencode
metadata:
  opencode/slash: "true"
---

## What I do

Guío la ejecución por fases. Prohíbo saltar fases.

## Workflow

1. Confirmar fase actual en `docs/PLAN_ETAPAS.md`.
2. Fase 0: monorepo pnpm + turbo (apps/web, apps/server), Dockerfile por app, docker-compose, eslint+prettier+vitest, CI GitHub Actions.
   DoD: `pnpm dev` + `docker compose up --build` OK.
3. Fase 1: mapa Tiled demo en `apps/web/public/maps/demo.tmj`, PixiJS render + WASD + colisiones + follow-cam.
   DoD: abrir 1 tab, moverse sin atravesar paredes, 60fps.
4. Fase 2: Colyseus GameRoom join/spawn/broadcast <100ms + interpolación + chat.
   DoD: 2 tabs ven avatares del otro moverse suave.
5. Fase 2.5: proximidad mock (radio 5 tiles) + zonas privadas + lista "cerca de mí".
   DoD: al acercarse 2 avatares aparece badge "en rango", en zona privada se aísla.
6. Fase 3+: solo con aprobación explícita (LiveKit + coturn).
7. Cada fase: plan → build → `pnpm build/lint/test` → demo navegador → commit en español.

## When to use me

Siempre al iniciar cualquier tarea de código. Si el usuario pide Fase 3+ sin cerrar Fase 2, negarse y explicar dependencia.
