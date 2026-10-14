import { ArraySchema, Schema, MapSchema, type } from "@colyseus/schema";

// Shared constants: single source of truth for client prediction,
// server validation and map bounds (demo.tmj is 40x30 @32px).
export const TILE = 32;
export const MAP_W = 40 * TILE;
export const MAP_H = 30 * TILE;
export const PLAYER_W = 20;
export const PLAYER_H = 28;
export const CLIENT_SPEED = 170; // px/s, must stay <= MAX_SPEED
export const MAX_SPEED = 260; // px/s tolerance for server validation
export const CHAT_MAX_LEN = 280;
export const CHAT_HISTORY = 50;
export const SPAWN = { x: 20 * TILE + TILE / 2, y: 24 * TILE + TILE / 2 };

/** Jugador. zoneId = "" fuera de zonas; el cliente la reporta (Fase 2.5). */
export class Player extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") name = "guest";
  @type("string") dir = "down";
  @type("string") anim = "idle";
  @type("string") zoneId = "";
}

export class ChatMessage extends Schema {
  @type("string") name = "";
  @type("string") text = "";
  @type("number") ts = 0;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ChatMessage]) messages = new ArraySchema<ChatMessage>();
}
