import { createHash, randomBytes } from "node:crypto";
import { Room, Client } from "colyseus";
import {
  GameState,
  MAP_H,
  MAP_W,
  Player,
  GameObject,
  DeskClaim,
  PLAYER_H,
  PLAYER_W,
  SPAWN,
  isMeetingRoom,
} from "@quiiven/protocol";
import {
  clampMove,
  sanitizeAvatarMsg,
  sanitizeBoardScene,
  sanitizeChat,
  sanitizeDeskConfig,
  validDeskId,
  sanitizeName,
  sanitizeStatus,
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
import { freeDeskIn, teamRoomOf } from "../teams.js";
import {
  deleteObject,
  getPlayerState,
  getRole,
  initDb,
  listDesks,
  listObjects,
  markDeskAutoAssigned,
  releaseDesk,
  saveDesk,
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

interface AvatarMsg {
  body?: unknown;
  height?: unknown;
  build?: unknown;
  skin?: unknown;
  hair?: unknown;
  hairColor?: unknown;
  facialHair?: unknown;
  top?: unknown;
  topColor?: unknown;
  bottom?: unknown;
  bottomColor?: unknown;
  shoesColor?: unknown;
  pet?: unknown;
  petColor?: unknown;
  accessories?: unknown;
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
  /** Locked rooms: who may be inside (present at lock time or let in). */
  private allowed = new Map<string, Set<string>>();
  /** Anti-spam for knocks and private messages (sessionId → last ms). */
  private lastKnockAt = new Map<string, number>();
  private lastDmAt = new Map<string, number>();
  /** sessionId → email of signed-in players (desk persistence). */
  private emails = new Map<string, string>();

  async onCreate() {
    this.setState(new GameState());
    this.setPatchRate(Number(process.env.GAME_PATCH_RATE ?? 50));
    await this.loadObjects();
    await this.loadDesks();
    this.onMessage("ping", (client) => {
      client.send("pong", { t: Date.now() });
    });
    this.onMessage("move", (client, msg: MoveMsg) =>
      this.handleMove(client, msg),
    );
    this.onMessage("chat", (client, msg: ChatMsg) =>
      this.handleChat(client, msg),
    );
    // Avatar visible: el cliente publica su config y se propaga validada.
    this.onMessage("avatar", (client, msg: AvatarMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (p) this.applyAvatar(p, msg);
    });
    // Presencia: aro + insignia + compuertas de audio (validada por allowlist).
    this.onMessage("status", (client, msg: { status?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.status = sanitizeStatus(msg?.status);
    });
    // Pizarra colaborativa: la escena viaja por TCP (estado documental
    // confiable, no media) y se reenvía a los demás sin inspeccionarla.
    this.onMessage("board-scene", (client, msg: { boardId?: unknown; elements?: unknown }) => {
      const clean = sanitizeBoardScene(msg);
      if (!clean) return;
      this.broadcast("board-scene", clean, { except: client });
    });
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
    // Salas de reunión: cerrar/abrir, tocar la puerta y dejar pasar.
    this.onMessage("room-lock", (client, msg: { zone?: unknown; locked?: unknown }) =>
      this.handleRoomLock(client, msg),
    );
    this.onMessage("room-knock", (client, msg: { zone?: unknown }) =>
      this.handleKnock(client, msg),
    );
    this.onMessage("room-admit", (client, msg: { zone?: unknown; to?: unknown }) =>
      this.handleAdmit(client, msg),
    );
    // Meet fijo de la sala: lo pone/quita alguien que esté dentro.
    this.onMessage("room-meet", (client, msg: { zone?: unknown; url?: unknown }) =>
      this.handleRoomMeet(client, msg),
    );
    // Chat privado 1 a 1: solo lo recibe el destinatario (y el eco al emisor).
    this.onMessage("dm", (client, msg: { to?: unknown; text?: unknown }) =>
      this.handleDm(client, msg),
    );
    // "Mi escritorio": reclamar, decorar y soltar (uno por persona).
    this.onMessage("desk-claim", (client, msg: { deskId?: unknown; config?: unknown }) =>
      this.handleDeskClaim(client, msg),
    );
    this.onMessage("desk-update", (client, msg: { config?: unknown }) =>
      this.handleDeskUpdate(client, msg),
    );
    this.onMessage("desk-release", (client, msg: { deskId?: unknown }) =>
      this.handleDeskRelease(client, msg),
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

  private async loadDesks(): Promise<void> {
    try {
      for (const d of await listDesks()) {
        const c = new DeskClaim();
        c.deskId = d.deskId;
        c.owner = d.ownerName;
        c.ownerKey = personKey(d.email);
        c.config = sanitizeDeskConfig(safeJson(d.config));
        this.state.desks.set(String(d.deskId), c);
      }
    } catch (e) {
      console.error("[game] load desks failed:", e);
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
    options: { name?: string; hidden?: boolean; avatar?: unknown } = {},
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
    // Avatar visible desde el primer frame (además del mensaje "avatar" en cambios).
    this.applyAvatar(p, options?.avatar);
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
    p.key = email ? personKey(email) : `g-${client.sessionId}`;
    if (email) this.emails.set(client.sessionId, email);
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
    // First time in: a free desk in your team's office (team from Airtable).
    if (email) this.autoAssignDesk(client, p, email).catch((e) => console.error("[game] auto desk failed:", e));
  }

  /** Escribe un avatar validado en el jugador (join + mensaje "avatar"). */
  private applyAvatar(p: Player, raw: unknown) {
    const a = sanitizeAvatarMsg(raw);
    p.body = a.body;
    p.height = a.height;
    p.build = a.build;
    p.skin = a.skin;
    p.hair = a.hair;
    p.hairColor = a.hairColor;
    p.facialHair = a.facialHair;
    p.top = a.top;
    p.topColor = a.topColor;
    p.bottom = a.bottom;
    p.bottomColor = a.bottomColor;
    p.shoesColor = a.shoesColor;
    p.pet = a.pet;
    p.petColor = a.petColor;
    p.accessories.splice(0, p.accessories.length);
    for (const acc of a.accessories) p.accessories.push(acc);
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
    this.lastKnockAt.delete(client.sessionId);
    this.lastDmAt.delete(client.sessionId);
    this.emails.delete(client.sessionId);
    // Guests' desks only live while they are connected.
    this.dropDesksOf(`g-${client.sessionId}`);
    this.releaseEmptyLocks();
    unlinkColyseus(client.sessionId);
    console.log(`[game] leave ${client.sessionId}`);
  }

  private handleMove(client: Client, msg: MoveMsg) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const now = Date.now();
    const dt = now - (this.lastMoveAt.get(client.sessionId) ?? now);
    this.lastMoveAt.set(client.sessionId, now);
    const zone = sanitizeZone(msg.zone);
    // Closed room: only people who were inside (or were let in) may enter.
    if (zone && zone !== p.zoneId && this.state.locks.has(zone) && !this.allowed.get(zone)?.has(client.sessionId)) {
      client.send("room-locked", { zone, by: this.state.locks.get(zone) });
      return;
    }
    const next = clampMove({ x: p.x, y: p.y }, { x: msg.x as number, y: msg.y as number }, dt);
    p.x = next.x;
    p.y = next.y;
    p.dir = validDir(msg.dir, p.dir);
    p.anim = validAnim(msg.anim, p.anim);
    const left = p.zoneId !== zone;
    p.zoneId = zone;
    if (left) this.releaseEmptyLocks();
  }

  private hasDesk(key: string): boolean {
    let has = false;
    this.state.desks.forEach((d) => {
      if (d.ownerKey === key) has = true;
    });
    return has;
  }

  private async autoAssignDesk(client: Client, p: Player, email: string) {
    if (this.hasDesk(p.key)) return;
    const zone = await teamRoomOf(email);
    if (!zone || this.hasDesk(p.key) || !this.state.players.has(client.sessionId)) return;
    const taken = new Set<number>();
    this.state.desks.forEach((d) => taken.add(d.deskId));
    const spot = freeDeskIn(zone, taken);
    if (!spot) return;
    // Only once per person: if they later free it, it stays free.
    if (!(await markDeskAutoAssigned(email))) return;
    const config = sanitizeDeskConfig({
      material: "clara",
      setup: "monitor",
      chairStyle: "ergonomica",
      chairColor: /^#[0-9a-f]{6}$/i.test(spot.color) ? spot.color : "#18d3b8",
      left: "suculenta",
      right: "taza",
      floor: "ninguno",
    });
    if (this.state.desks.has(String(spot.deskId)) || !(await saveDesk(email, spot.deskId, p.name, config))) return;
    const c = new DeskClaim();
    c.deskId = spot.deskId;
    c.owner = p.name;
    c.ownerKey = p.key;
    c.config = config;
    this.state.desks.set(String(spot.deskId), c);
    client.send("desk-assigned", { deskId: spot.deskId, zone });
  }

  /** Removes every desk claim of a person (optionally keeping one). */
  private dropDesksOf(key: string, keep?: string) {
    const gone: string[] = [];
    this.state.desks.forEach((d, id) => {
      if (d.ownerKey === key && id !== keep) gone.push(id);
    });
    for (const id of gone) this.state.desks.delete(id);
  }

  private async handleDeskClaim(client: Client, msg: { deskId?: unknown; config?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    const deskId = validDeskId(msg?.deskId);
    if (!p || deskId === null) return;
    const id = String(deskId);
    const cur = this.state.desks.get(id);
    if (cur && cur.ownerKey !== p.key) {
      client.send("desk-taken", { deskId, owner: cur.owner });
      return;
    }
    const config = sanitizeDeskConfig(msg?.config);
    const email = this.emails.get(client.sessionId);
    if (email) {
      try {
        if (!(await saveDesk(email, deskId, p.name, config))) {
          client.send("desk-taken", { deskId, owner: this.state.desks.get(id)?.owner ?? "" });
          return;
        }
      } catch (e) {
        console.error("[game] save desk failed:", e);
      }
    }
    // One desk per person: claiming a new one frees the previous one.
    this.dropDesksOf(p.key, id);
    const c = this.state.desks.get(id) ?? new DeskClaim();
    c.deskId = deskId;
    c.owner = p.name;
    c.ownerKey = p.key;
    c.config = config;
    this.state.desks.set(id, c);
  }

  private async handleDeskUpdate(client: Client, msg: { config?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    let mine: DeskClaim | undefined;
    this.state.desks.forEach((d) => {
      if (d.ownerKey === p.key) mine = d;
    });
    if (!mine) return;
    mine.config = sanitizeDeskConfig(msg?.config);
    mine.owner = p.name;
    const email = this.emails.get(client.sessionId);
    if (email) await saveDesk(email, mine.deskId, p.name, mine.config).catch((e) => console.error("[game] save desk failed:", e));
  }

  private async handleDeskRelease(client: Client, msg: { deskId?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    // An admin can free anybody's desk (someone left the company, etc.).
    const deskId = validDeskId(msg?.deskId);
    if (deskId !== null && this.state.desks.get(String(deskId))?.ownerKey !== p.key) {
      if (!(await this.isAdmin(client))) return;
      this.state.desks.delete(String(deskId));
      await releaseDesk({ deskId }).catch((e) => console.error("[game] release desk failed:", e));
      return;
    }
    this.dropDesksOf(p.key);
    const email = this.emails.get(client.sessionId);
    if (email) await releaseDesk({ email }).catch((e) => console.error("[game] release desk failed:", e));
  }

  /** Session ids currently inside a zone. */
  private inZone(zone: string): string[] {
    const ids: string[] = [];
    this.state.players.forEach((pl, id) => {
      if (pl.zoneId === zone) ids.push(id);
    });
    return ids;
  }

  /** A locked room opens by itself once everybody has left it. */
  private releaseEmptyLocks() {
    for (const zone of Array.from(this.state.locks.keys())) {
      if (this.inZone(zone).length === 0) {
        this.state.locks.delete(zone);
        this.allowed.delete(zone);
      }
    }
  }

  private async handleRoomLock(client: Client, msg: { zone?: unknown; locked?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    const zone = sanitizeZone(msg?.zone);
    if (!p || !zone || !isMeetingRoom(zone)) return;
    // Only someone inside the room (or an admin) can close or open it.
    if (p.zoneId !== zone && !(await this.isAdmin(client))) return;
    if (msg?.locked === true) {
      this.state.locks.set(zone, p.name);
      this.allowed.set(zone, new Set(this.inZone(zone)));
    } else {
      this.state.locks.delete(zone);
      this.allowed.delete(zone);
    }
  }

  private handleKnock(client: Client, msg: { zone?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    const zone = sanitizeZone(msg?.zone);
    if (!p || !zone || !this.state.locks.has(zone)) return;
    const now = Date.now();
    if (now - (this.lastKnockAt.get(client.sessionId) ?? 0) < 5000) return;
    this.lastKnockAt.set(client.sessionId, now);
    const inside = new Set(this.inZone(zone));
    for (const c of this.clients) {
      if (inside.has(c.sessionId)) c.send("room-knock", { zone, from: client.sessionId, name: p.name, ts: now });
    }
  }

  private handleAdmit(client: Client, msg: { zone?: unknown; to?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    const zone = sanitizeZone(msg?.zone);
    if (!p || !zone || p.zoneId !== zone || !this.state.locks.has(zone)) return;
    const target = this.clients.find((c) => c.sessionId === msg?.to);
    if (!target || !this.state.players.has(target.sessionId)) return;
    this.allowed.get(zone)?.add(target.sessionId);
    target.send("room-admitted", { zone, by: p.name });
  }

  private async handleRoomMeet(client: Client, msg: { zone?: unknown; url?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    const zone = sanitizeZone(msg?.zone);
    if (!p || !zone || !isMeetingRoom(zone)) return;
    if (p.zoneId !== zone && !(await this.isAdmin(client))) return;
    if (msg?.url === "" || msg?.url === null || msg?.url === undefined) {
      this.state.roomMeets.delete(zone);
      return;
    }
    const url = validMeet(msg.url);
    if (url) this.state.roomMeets.set(zone, url);
  }

  private handleDm(client: Client, msg: { to?: unknown; text?: unknown }) {
    const p = this.state.players.get(client.sessionId);
    if (!p || typeof msg?.to !== "string" || msg.to === client.sessionId) return;
    const text = sanitizeChat(msg.text);
    if (!text) return;
    const target = this.clients.find((c) => c.sessionId === msg.to);
    if (!target || !this.state.players.has(target.sessionId)) return;
    const now = Date.now();
    if (now - (this.lastDmAt.get(client.sessionId) ?? 0) < 250) return;
    this.lastDmAt.set(client.sessionId, now);
    // Ephemeral like the general chat: never stored, never in the synced state.
    target.send("dm", { from: client.sessionId, name: p.name, text, ts: now });
    client.send("dm-sent", { to: target.sessionId, text, ts: now });
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

/** Opaque stable id for a person (never expose the email in the state). */
function personKey(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
