# Google OAuth — Setup local (Fase 4.5)

GatherQuiiven integra Google de forma **server-side**: el Client Secret nunca
toca el navegador. El usuario vincula su cuenta (popup OAuth) y luego puede ver
su calendario y crear reuniones Meet que se publican en vivo en la TV Sala 1.

## 1. Crear el OAuth client (Google Cloud)

1. Ir a <https://console.cloud.google.com/apis/credentials> y crear proyecto.
2. **APIs y servicios → Biblioteca**: habilitar **Google Calendar API**.
3. **Pantalla de consentimiento OAuth**: tipo **Externa**, email de prueba =
   tu Gmail. En *Scopes* añadir:
   - `.../auth/calendar.readonly`
   - `.../auth/calendar.events`
   - (openid/email/profile van solos)
   - En *Usuarios de prueba* agrega tu email (modo Testing).
4. **Credenciales → Crear credencial → ID de cliente OAuth**:
   - Tipo: **Aplicación web**
   - **URI de JavaScript autorizados**: `http://localhost:5173`
   - **URI de redirección autorizados**: `http://localhost:2567/auth/google/callback`
   - Copiar **Client ID** y **Client Secret**.

> En Testing el token expira en ~7 días; para prod publica la app o añade
> usuarios de prueba. El `refresh_token` se persiste cifrado, así que el
> re-consentimiento es raro.

## 2. Variables de entorno (`.env`)

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:2567/auth/google/callback
# 32 bytes hex:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
GOOGLE_TOKEN_KEY=<64 hex chars>
VITE_API_BASE=http://localhost:2567
```

Nunca commitear `.env`. `.env.example` documenta las claves.

## 3. Cómo funciona

- `apps/server/src/auth/google.ts` — flujo OAuth, refresh, validación de Meet.
- `apps/server/src/auth/store.ts` — refresh tokens cifrados con AES-256-GCM
  en `data/google-tokens.json` (permisos 0600). En prod: BD + KMS.
- `apps/server/src/auth/sessions.ts` — cookie `gq_session` HttpOnly ↔ google
  `sub`; se enlaza a la sesión Colyseus en el upgrade WS (`GameRoom.onAuth`).
- `apps/server/src/auth/routes.ts` — endpoints REST (ver abajo).
- Web: `src/api/google.ts` + `src/ui/GooglePanel.tsx` + `SmartObjectModal`.

### Endpoints (server, origen `VITE_API_BASE`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/auth/google` | Redirige al consent de Google (popup) |
| GET | `/auth/google/callback` | Callback OAuth; setea cookie; cierra popup |
| GET | `/auth/google/status` | `{ linked, configured, email? }` |
| POST | `/auth/google/unlink` | Borra tokens + cookie |
| GET | `/api/calendar/events` | Próximos eventos del calendario primario |
| POST | `/api/meetings` | Crea evento + Meet (`{title, minutes, startISO}`) |

## 4. Seguridad
- Client Secret solo en server; cookie HttpOnly + SameSite=Lax.
- Solo `https://meet.google.com/...` se aceptan en `set-meet` (no URLs arbitrarias).
- `set-meet` solo lo procesa el server si la sesión WS está vinculada a Google.
- Los tokens en disco van cifrados (GCM); la clave no se commitea.

## 5. Verificar
1. `pnpm dev` (web :5173, server :2567).
2. Panel superior derecho → **Vincular Google** (popup) → autorizar.
3. Aparece correo, "Mi día" y formulario "Crear Meet".
4. Crear → se publica `meetUrl`; acércate a la TV Sala 1 y se carga el Meet.
5. `pnpm test` incluye tests de `validMeetUrl` y token store.
