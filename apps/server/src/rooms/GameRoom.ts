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
} from "../net/validate.js";

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
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const p = new Player();
    p.name = sanitizeName(options.name, `guest-${client.sessionId.slice(0, 4)}`);
    p.x = Math.round(SPAWN.x - 10 + (Math.random() * 60 - 30));
    p.y = Math.round(SPAWN.y - 14 + (Math.random() * 40 - 20));
    this.state.players.set(client.sessionId, p);
    this.lastMoveAt.set(client.sessionId, Date.now());
    console.log(`[game] join ${client.sessionId} as ${p.name}`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
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
