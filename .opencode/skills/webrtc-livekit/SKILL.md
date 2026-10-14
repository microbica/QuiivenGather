---
name: webrtc-livekit
description: Solo Fase 3+. SFU LiveKit, audio espacial y TURN endurecido
license: MIT
compatibility: opencode
metadata:
  opencode/slash: "false"
---

## Regla de activación

NO usar en Fase 0-2.5. Solo bajo tarea explícita Fase 3.

## LiveKit

- Un publish por cliente al SFU (star, no mesh). Simulcast 180p/360p/720p.
- Subscribe dinámico: `setSubscribed(track, distance < radius || samePrivateZone)`.
- Token JWT desde backend (TTL 5min), nunca API secret en frontend.

## Audio espacial

```ts
panner.panningModel = 'equalpower';
panner.distanceModel = 'linear';
panner.refDistance = 1; panner.maxDistance = TILE*5; panner.rolloffFactor = 1;
source.connect(panner).connect(destination);
// por frame: panner.positionX.value = dx; positionY.value = dy; positionZ.value = 0;
```

Prohibido HRTF a escala.

## coturn

- Puertos 3478 + TURNS 5349/443 con Let's Encrypt.
- `use-auth-secret + static-auth-secret`, creds HMAC `username = expiry:userid`, password = base64(hmac(secret, username)).
- Deny `127.0.0.0/8, 10.0.0.0/8, 192.168.0.0/16, 169.254.169.254`.

## Coste

Cloud: $0.004/min voz, $0.016/min video + egress $0.024. Self-hosted: bandwidth + CPU. Decisión pendiente en docs/DECISIONES_ABIERTAS.md.
