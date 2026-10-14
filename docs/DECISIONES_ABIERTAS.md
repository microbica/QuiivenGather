# DECISIONES ABIERTAS — responder antes de cada fase

## Antes de Fase 0 (esta semana)
1. **Auth real:** ¿Clerk, Auth.js (NextAuth), Supabase Auth, o login propio JWT? → define `apps/server` auth hook y `packages/protocol` User. Propuesta: Clerk (rápido) o Supabase si ya hay Postgres.
2. **Nombre paquete/monorepo:** ¿`gatherquiiven`, `@quiiven/*`? ¿pnpm 9 + node 22?
3. **Dominio Lightsail:** ¿subdominio + DNS disponible? Necesario para WSS + TURNS 443 en Fase 3, pero reservar ya.
4. **Assets mapa:** ¿tiles placeholder CC0 (ej. OpenGameArt) o diseñador propio 32px? Sin esto Fase 1 se bloquea.

## Antes de Fase 3 (no urgente, pero cotizar)
5. **SFU:** LiveKit Cloud (rápido, $/min) vs self-hosted en Lightsail (DevOps, bandwidth). Criterio: <5000 min/mes → Cloud; más → self.
6. **TURN:** ¿coturn en mismo Lightsail o servicio (Cloudflare Calls, Twilio)? Requiere 443/5349 + cert.
7. **Egress/grabación:** ¿necesaria en MVP? Si sí, S3/compatible + presupuesto GPU.

Responde con `question` tool o edita este archivo marcando `[x]`. Sin 1-4 no arrancar Fase 0 código.
