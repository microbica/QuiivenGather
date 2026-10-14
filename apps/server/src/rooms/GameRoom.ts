import { randomBytes } from "node:crypto";
import { Room, Client } from "colyseus";
import {
  CHAT_HISTORY,
  GameState,
  Player,
  ChatMessage,
  GameObject,
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
  getRole,
  initDb,
  listObjects,
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

/** Fase 2: servidor autoritativo. Valida movimiento (anti-teleport) y chat. */
export class GameRoom extends Room<GameState> {
  maxClients = 50;
  private lastMoveAt = new Map<string, number>();

  onCreate() {
    this.setState(new GameState());
    this.setPatchRate(Number(process.env.GAME_PATCH_RATE ?? 50));
    this.loadObjects();
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
  }

  private loadObjects(): void {
    initDb();
    for (const o of listObjects()) {
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
  onAuth(_client: Client, _options: unknown, request: { headers?: { cookie?: string } }) {
    const sub = sessionSub(request?.headers?.cookie);
    if (sub) {
      const stored = getTokens(sub);
      if (stored && isEmailAllowed(stored.email)) {
        return {
          googleSub: sub,
          name: stored.name,
          email: stored.email,
          role: getRole(stored.email),
        };
      }
    }
    if (process.env.NODE_ENV === "production") return null;
    return { googleSub: null, name: undefined, role: "user" };
  }

  onJoin(
    client: Client,
    options: { name?: string } = {},
    auth: { googleSub?: string | null; name?: string; role?: string } = {},
  ) {
    const p = new Player();
    // Nombre autoritativo del perfil de Google; fallback a lo que envíe el cliente.
    p.name = sanitizeName(auth?.name ?? options?.name, `user-${client.sessionId.slice(0, 4)}`);
    p.x = Math.round(SPAWN.x - 10 + (Math.random() * 60 - 30));
    p.y = Math.round(SPAWN.y - 14 + (Math.random() * 40 - 20));
    this.state.players.set(client.sessionId, p);
    this.lastMoveAt.set(client.sessionId, Date.now());
    if (auth.googleSub) linkColyseus(client.sessionId, auth.googleSub);
    console.log(`[game] join ${client.sessionId} as ${p.name}`);
  }

  onLeave(client: Client) {
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

  private isAdmin(client: Client): boolean {
    const sub = linkedSubLookup(client.sessionId);
    if (!sub) return false;
    const stored = getTokens(sub);
    if (!stored) return false;
    return getRole(stored.email) === "admin";
  }

  private handleObjMove(client: Client, msg: ObjMoveMsg) {
    if (!this.isAdmin(client)) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    const g = this.state.objects.get(id);
    if (!g) return;
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    g.x = Math.round(x);
    g.y = Math.round(y);
    upsertObject({
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

  private handleObjAdd(client: Client, msg: ObjAddMsg) {
    if (!this.isAdmin(client)) return;
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
    upsertObject({
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

  private handleObjRotate(client: Client, msg: ObjRotateMsg) {
    if (!this.isAdmin(client)) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    const g = this.state.objects.get(id);
    if (!g) return;
    g.rotation = validRotation(msg.rotation);
    upsertObject({
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

  private handleObjRemove(client: Client, msg: ObjRemoveMsg) {
    if (!this.isAdmin(client)) return;
    const id = typeof msg.id === "string" ? msg.id : "";
    if (!this.state.objects.has(id)) return;
    this.state.objects.delete(id);
    deleteObject(id);
  }

  private handleChat(client: Client, msg: ChatMsg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const text = sanitizeChat(msg.text);
    if (!text) return;
    const m = new ChatMessage();
    m.name = p.name;
    m.text = text;
    m.ts = Date.now();
    this.state.messages.push(m);
    while (this.state.messages.length > CHAT_HISTORY) {
      this.state.messages.shift();
    }
  }
}

function clampDim(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 64;
  return Math.round(Math.min(max, Math.max(min, n)));
}
