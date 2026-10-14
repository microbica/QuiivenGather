import { Room, Client } from "colyseus";
import {
  CHAT_HISTORY,
  GameState,
  Player,
  ChatMessage,
  SPAWN,
} from "@quiiven/protocol";
import {
  clampMove,
  sanitizeChat,
  sanitizeName,
  sanitizeZone,
  validAnim,
  validDir,
  validSignal,
} from "../net/validate.js";
import {
  sessionSub,
  linkColyseus,
  unlinkColyseus,
  linkedSub as linkedSubLookup,
} from "../auth/sessions.js";
import { validMeetUrl as validMeet } from "../auth/google.js";

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

/** Fase 2: servidor autoritativo. Valida movimiento (anti-teleport) y chat. */
export class GameRoom extends Room<GameState> {
  maxClients = 50;
  private lastMoveAt = new Map<string, number>();

  onCreate() {
    this.setState(new GameState());
    this.setPatchRate(Number(process.env.GAME_PATCH_RATE ?? 50));
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
  }

  // Lee la cookie gq_session del upgrade WS y vincula con la cuenta Google.
  onAuth(_client: Client, _options: unknown, request: { headers?: { cookie?: string } }) {
    const sub = sessionSub(request?.headers?.cookie);
    return { googleSub: sub ?? null };
  }

  onJoin(client: Client, options: { name?: string } = {}, auth: { googleSub?: string | null } = {}) {
    const p = new Player();
    p.name = sanitizeName(options.name, `guest-${client.sessionId.slice(0, 4)}`);
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
