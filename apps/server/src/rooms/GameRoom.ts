import { randomBytes } from "node:crypto";
import { Room, Client } from "colyseus";
import {
  GameState,
  MAP_H,
  MAP_W,
  Player,
  GameObject,
  PLAYER_H,
  PLAYER_W,
  SPAWN,
} from "@quiiven/protocol";
import {
  clampMove,
  sanitizeChat,
  sanitizeName,
  sanitizeZone,
  validAnim,
  validDir,
  validKind,
  validMaterial,
  validRotation,
  validSignal,
} from "../net/validate.js";
import {
  sessionSub,
  linkColyseus,
  unlinkColyseus,
  linkedSub as linkedSubLookup,
} from "../auth/sessions.js";
import { validMeetUrl as validMeet, isEmailAllowed } from "../auth/google.js";
import { getTokens } from "../auth/store.js";
import {
  deleteObject,
  getPlayerState,
  getRole,
  initDb,
  listObjects,
  savePlayerState,
  upsertObject,
} from "../db.js";

interface MoveMsg {
  x?: unknown;
  y?: unknown;
  dir?: unknown;
  anim?: unknown;
  zone?: unknown;
}

interface ChatMsg {
  text?: unknown;
}

interface SignalMsg {
  to?: unknown;
  kind?: unknown;
  sdp?: unknown;
  candidate?: unknown;
}

interface MeetMsg {
  url?: unknown;
}

interface ObjMoveMsg {
  id?: unknown;
  x?: unknown;
  y?: unknown;
}

interface ObjAddMsg {
  label?: unknown;
  kind?: unknown;
  material?: unknown;
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  radius?: unknown;
  url?: unknown;
  rotation?: unknown;
}

interface ObjRemoveMsg {
  id?: unknown;
}

interface ObjRotateMsg {
  id?: unknown;
  rotation?: unknown;
}

interface ObjUpdateMsg {
  id?: unknown;
  label?: unknown;
  kind?: unknown;
  material?: unknown;
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  radius?: unknown;
  url?: unknown;
  rotation?: unknown;
}

/** Fase 2: servidor autoritativo. Valida movimiento (anti-teleport) y chat. */
export class GameRoom extends Room<GameState> {
  maxClients = 50;
  private lastMoveAt = new Map<string, number>();

  async onCreate() {
    this.setState(new GameState());
    this.setPatchRate(Number(process.env.GAME_PATCH_RATE ?? 50));
    await this.loadObjects();
    this.onMessage("ping", (client) => {
      client.send("pong", { t: Date.now() });
    });
    this.onMessage("move", (client, msg: MoveMsg) =>
      this.handleMove(client, msg),
    );
    this.onMessage("chat", (client, msg: ChatMsg) =>
      this.handleChat(client, msg),
    );
    // Fase 3: relay de señalización WebRTC (SDP/ICE). Solo metadata por TCP;
    // nunca media. El servidor no inspecciona el contenido.
    this.onMessage("rtc-signal", (client, msg: SignalMsg) =>
      this.handleSignal(client, msg),
    );
    // Fase 4.5: solo usuarios vinculados a Google pueden publicar Meet en vivo.
    this.onMessage("set-meet", (client, msg: MeetMsg) =>
      this.handleSetMeet(client, msg),
    );
    // Fase 6: admin puede mover, duplicar y borrar objetos del mapa.
    this.onMessage("obj-move", (client, msg: ObjMoveMsg) =>
      this.handleObjMove(client, msg),
    );
    this.onMessage("obj-add", (client, msg: ObjAddMsg) =>
      this.handleObjAdd(client, msg),
    );
    this.onMessage("obj-remove", (client, msg: ObjRemoveMsg) =>
      this.handleObjRemove(client, msg),
    );
    this.onMessage("obj-rotate", (client, msg: ObjRotateMsg) =>
      this.handleObjRotate(client, msg),
    );
    // Página de admin: edición completa de un objeto existente.
    this.onMessage("obj-update", (client, msg: ObjUpdateMsg) =>
      this.handleObjUpdate(client, msg),
    );
  }

  private async loadObjects(): Promise<void> {
    await initDb();
    const rows = await listObjects();
    for (const o of rows) {
      const g = new GameObject();
      g.id = o.id;
      g.label = o.label;
      g.kind = validKind(o.kind);
      g.material = validMaterial(o.material);
      g.x = o.x;
      g.y = o.y;
      g.w = o.w;
      g.h = o.h;
      g.radius = o.radius;
      g.url = o.url;
      g.rotation = validRotation(o.rotation);
      this.state.objects.set(o.id, g);
    }
  }

  // Login del juego: requiere cookie de sesión Google Y dominio permitido.
  // En producción, sin eso onAuth devuelve null y Colyseus rechaza el join.
  // Fuera de producción (dev/smoke) se permite guest para pruebas automáticas.
  async onAuth(_client: Client, _options: unknown, request: { headers?: { cookie?: string } }) {
    const sub = sessionSub(request?.headers?.cookie);
    if (sub) {
      const stored = getTokens(sub);
      if (stored && isEmailAllowed(stored.email)) {
        return {
          googleSub: sub,
          name: stored.name,
          email: stored.email,
          role: await getRole(stored.email),
        };
      }
    }
    if (process.env.NODE_ENV === "production") return null;
    return { googleSub: null, name: undefined, role: "user" };
  }

  private saveTimers = new Map<string, NodeJS.Timeout>();

  async onJoin(
    client: Client,
    options: { name?: string; hidden?: boolean } = {},
    auth: { googleSub?: string | null; name?: string; email?: string; role?: string } = {},
  ) {
    // Conexión de administración (página #/admin): sin avatar en la sala,
    // solo para operar objetos/Meet con la sesión vinculada.
    if (options.hidden) {
      if (auth.googleSub) linkColyseus(client.sessionId, auth.googleSub);
      console.log(`[game] join (hidden admin) ${client.sessionId} as ${auth.name ?? "admin"}`);
      return;
    }
    const p = new Player();
    p.name = sanitizeName(auth?.name ?? options?.name, `user-${client.sessionId.slice(0, 4)}`);
    // Restaurar estado persistido (DB) si el usuario está autenticado.
    const email = auth?.email?.toLowerCase();
    let saved: Awaited<ReturnType<typeof getPlayerState>> = null;
    if (email) {
      try {
        saved = await getPlayerState(email);
      } catch (e) {
        console.error(`[game] load player state failed for ${email}:`, e);
      }
    }
    if (saved) {
      p.x = clamp(saved.x, 0, MAP_W - PLAYER_W);
      p.y = clamp(saved.y, 0, MAP_H - PLAYER_H);
      p.dir = validDir(saved.dir, "down");
      p.anim = "idle";
      p.zoneId = sanitizeZone(saved.zoneId);
      p.color = saved.color || colorFromEmail(email!);
    } else {
      p.x = Math.round(SPAWN.x - 10 + (Math.random() * 60 - 30));
      p.y = Math.round(SPAWN.y - 14 + (Math.random() * 40 - 20));
      p.color = email ? colorFromEmail(email) : 0xf2a54a; // guest: naranja
    }
    this.state.players.set(client.sessionId, p);
    this.lastMoveAt.set(client.sessionId, Date.now());
    if (auth.googleSub) linkColyseus(client.sessionId, auth.googleSub);
    // Save periódico cada 10s (además del save en onLeave).
    if (email) {
      const timer = setInterval(() => {
        const cur = this.state.players.get(client.sessionId);
        if (cur) this.persistPlayer(cur, email).catch(console.error);
      }, 10_000);
      this.saveTimers.set(client.sessionId, timer);
    }
    console.log(`[game] join ${client.sessionId} as ${p.name}${saved ? " (restored)" : ""}`);
  }

  private async persistPlayer(p: Player, email: string): Promise<void> {
    await savePlayerState(email, {
      x: p.x,
      y: p.y,
      dir: p.dir,
      anim: p.anim,
      zoneId: p.zoneId,
      color: p.color,
    });
  }

  async onLeave(client: Client) {
    // Save final antes de soltar al jugador.
    const sub = linkedSubLookup(client.sessionId);
    if (sub) {
      const stored = getTokens(sub);
      const p = this.state.players.get(client.sessionId);
      if (stored?.email && p) {
        await this.persistPlayer(p, stored.email);
      }
    }
    const timer = this.saveTimers.get(client.sessionId);
    if (timer) clearInterval(timer);
    this.saveTimers.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    unlinkColyseus(client.sessionId);
    console.log(`[game] leave ${client.sessionId}`);
  }

  private handleMove(client: Client, msg: MoveMsg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const now = Date.now();
    const dt = now - (this.lastMoveAt.get(client.sessionId) ?? now);
    this.lastMoveAt.set(client.sessionId, now);
    const next = clampMove({ x: p.x, y: p.y }, { x: msg.x as number, y: msg.y as number }, dt);
    p.x = next.x;
    p.y = next.y;
    p.dir = validDir(msg.dir, p.dir);
    p.anim = validAnim(msg.anim, p.anim);
    p.zoneId = sanitizeZone(msg.zone);
  }

  private handleSignal(client: Client, msg: SignalMsg) {
    const target = this.clients.find((c) => c.sessionId === msg.to);
    if (!target) return;
    const relay = validSignal(msg, new Set(this.clients.map((c) => c.sessionId)));
    if (!relay) return;
    target.send("rtc-signal", { from: client.sessionId, ...relay });
  }

  private handleSetMeet(client: Client, msg: MeetMsg) {
    // Permite limpiar el Meet en vivo (url vacío) por el usuario vinculado.
    if (msg.url === "" || msg.url === null || msg.url === undefined) {
      const sub = linkedSubLookup(client.sessionId);
      if (!sub) {
        client.send("meet-denied", { reason: "not_linked" });
        return;
      }
      this.state.meetUrl = "";
      return;
    }
    const url = validMeet(msg.url);
    if (!url) return;
    // Solo usuarios vinculados (sesión WS => googleSub) pueden publicar.
    // Sin vincular, el server ignora silenciosamente (no es un error fatal).
    const sub = linkedSubLookup(client.sessionId);
    if (!sub) {
      client.send("meet-denied", { reason: "not_linked" });
      return;
    }
    this.state.meetUrl = url;
  }

  private async isAdmin(client: Client): Promise<boolean> {
    const sub = linkedSubLookup(client.sessionId);
    if (!sub) return false;
    const stored = getTokens(sub);
    if (!stored) return false;
    return (await getRole(stored.email)) === "admin";
  }

  private async handleObjMove(client: Client, msg: ObjMoveMsg) {
    if (!(await this.isAdmin(client))) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    const g = this.state.objects.get(id);
    if (!g) return;
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    g.x = Math.round(x);
    g.y = Math.round(y);
    await upsertObject({
      id: g.id,
      label: g.label,
      kind: g.kind,
      material: g.material,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      radius: g.radius,
      url: g.url,
      rotation: g.rotation,
    });
  }

  private async handleObjAdd(client: Client, msg: ObjAddMsg) {
    if (!(await this.isAdmin(client))) return;
    const label =
      typeof msg.label === "string" && msg.label.trim()
        ? msg.label.trim().slice(0, 60)
        : "Objeto";
    const kind = validKind(msg.kind);
    const material = validMaterial(msg.material);
    const w = clampDim(msg.w, 16, 512);
    const h = clampDim(msg.h, 16, 512);
    const radius = clampDim(msg.radius, 0, 512);
    const url = typeof msg.url === "string" ? msg.url.trim().slice(0, 300) : "";
    const rotation = validRotation(msg.rotation);
    const g = new GameObject();
    g.id = `obj-${randomBytes(6).toString("hex")}`;
    g.label = label;
    g.kind = kind;
    g.material = material;
    g.x = Math.round(Number(msg.x) || 0);
    g.y = Math.round(Number(msg.y) || 0);
    g.w = w;
    g.h = h;
    g.radius = radius;
    g.url = url;
    g.rotation = rotation;
    this.state.objects.set(g.id, g);
    await upsertObject({
      id: g.id,
      label: g.label,
      kind: g.kind,
      material: g.material,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      radius: g.radius,
      url: g.url,
      rotation: g.rotation,
    });
  }

  private async handleObjRotate(client: Client, msg: ObjRotateMsg) {
    if (!(await this.isAdmin(client))) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    const g = this.state.objects.get(id);
    if (!g) return;
    g.rotation = validRotation(msg.rotation);
    await upsertObject({
      id: g.id,
      label: g.label,
      kind: g.kind,
      material: g.material,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      radius: g.radius,
      url: g.url,
      rotation: g.rotation,
    });
  }

  private async handleObjUpdate(client: Client, msg: ObjUpdateMsg) {
    if (!(await this.isAdmin(client))) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    const g = this.state.objects.get(id);
    if (!g) return;
    if (typeof msg.label === "string" && msg.label.trim()) {
      g.label = msg.label.trim().slice(0, 60);
    }
    if (msg.kind !== undefined) g.kind = validKind(msg.kind);
    if (msg.material !== undefined) g.material = validMaterial(msg.material);
    if (msg.x !== undefined && Number.isFinite(Number(msg.x))) g.x = Math.round(Number(msg.x));
    if (msg.y !== undefined && Number.isFinite(Number(msg.y))) g.y = Math.round(Number(msg.y));
    if (msg.w !== undefined) g.w = clampDim(msg.w, 16, 512);
    if (msg.h !== undefined) g.h = clampDim(msg.h, 16, 512);
    if (msg.radius !== undefined) g.radius = clampDim(msg.radius, 0, 512);
    if (typeof msg.url === "string") g.url = msg.url.trim().slice(0, 300);
    if (msg.rotation !== undefined) g.rotation = validRotation(msg.rotation);
    await upsertObject({
      id: g.id,
      label: g.label,
      kind: g.kind,
      material: g.material,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      radius: g.radius,
      url: g.url,
      rotation: g.rotation,
    });
  }

  private async handleObjRemove(client: Client, msg: ObjRemoveMsg) {
    if (!(await this.isAdmin(client))) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    if (!this.state.objects.has(id)) return;
    this.state.objects.delete(id);
    await deleteObject(id);
  }

  private handleChat(client: Client, msg: ChatMsg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const text = sanitizeChat(msg.text);
    if (!text) return;
    // Efímero: solo a los conectados en este momento. Ni se persiste en DB
    // ni entra al estado sincronizado, así quien llegue tarde no ve historial.
    this.broadcast("chat", { name: p.name, text, ts: Date.now() });
  }
}

function clampDim(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 64;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Color estable derivado del email (hash djb2 → RGB brillante). */
function colorFromEmail(email: string): number {
  let h = 5381;
  for (let i = 0; i < email.length; i++) h = ((h << 5) + h) + email.charCodeAt(i);
  const v = Math.abs(h) % 0xffffff;
  const r = ((v >> 16) & 0xff) | 0x40;
  const g = ((v >> 8) & 0xff) | 0x40;
  const b = (v & 0xff) | 0x40;
  return (r << 16) | (g << 8) | b;
}
