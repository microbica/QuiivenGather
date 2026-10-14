# gatherQuiiven — Fase 0 (localhost)

Clon web de Gather: oficina virtual 2D. Ver `AGENTS.md` y `docs/`.

## Requisitos
- Node 22, pnpm 9, Docker + Compose.

## Env
Todas las variables están documentadas en `.env.example`.
```sh
Copy-Item .env.example .env   # PowerShell
```

| Variable | Dónde | Para qué | Fase |
|---|---|---|---|
| `VITE_COLYSEUS_URL` | web | URL WS del server | 0-2 |
| `VITE_MAP_DEFAULT` | web | mapa Tiled | 1 |
| `VITE_PROXIMITY_RADIUS_TILES` | web | radio proximidad | 2.5 |
| `VITE_AUTH_PROVIDER` | web | none/clerk/supabase | 2 |
| `SERVER_PORT` | server | puerto Colyseus (2567) | 0 |
| `SERVER_CORS_ORIGIN` | server | origen web permitido | 0 |
| `GAME_PATCH_RATE` | server | ms entre deltas (50) | 2 |
| `GAME_MAX_CLIENTS` | server | cupo room | 2 |
| `JWT_SECRET` | server | tokens futuros | 3 |
| `LIVEKIT_*` / `TURN_SECRET` / `REDIS_URL` | — | reservadas Fase 3+ | 3 |

## Dev
```sh
pnpm install
pnpm dev   # web :5173 + server :2567
```
Abrir http://localhost:5173 → debe decir "Fase 0 OK" y `online`.

## Docker
```sh
docker compose up --build
```
