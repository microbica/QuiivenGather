import { ArraySchema, Schema, MapSchema, type } from "@colyseus/schema";

// Shared constants: single source of truth for client prediction,
// server validation and map bounds (demo.tmj is 100x60 @32px, see scripts/gen-map.mjs).
export const TILE = 32;
export const MAP_W = 100 * TILE; // 3200px - amplio para ~100 personas
export const MAP_H = 60 * TILE;  // 1920px
export const PLAYER_W = 20;
export const PLAYER_H = 28;
export const CLIENT_SPEED = 170; // px/s, must stay <= MAX_SPEED
export const MAX_SPEED = 260; // px/s tolerance for server validation
export const CHAT_MAX_LEN = 280;
export const MESH_MAX_PEERS = 5; // Fase 3: malla P2P, tope por proximidad
// Spawn en la Recepción (oficina Quiiven, scripts/gen-map.mjs).
export const SPAWN = { x: 50 * TILE + TILE / 2, y: 52 * TILE + TILE / 2 };

/** Jugador. zoneId = "" fuera de zonas; el cliente la reporta (Fase 2.5). */
export class Player extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") name = "guest";
  @type("string") dir = "down";
  @type("string") anim = "idle";
  @type("string") zoneId = "";
  /** Color del avatar (asignado por el server al unirse, estable por usuario). */
  @type("number") color = 0;
  /**
   * Avatar visible (skin, ropa, mascota): lo publica el cliente y el servidor
   * lo valida. "" = sin definir (el cliente usa un fallback determinista).
   */
  @type("string") body = "";
  @type("string") height = "";
  @type("string") build = "";
  @type("string") skin = "";
  @type("string") hair = "";
  @type("string") hairColor = "";
  @type("string") facialHair = "";
  @type("string") top = "";
  @type("string") topColor = "";
  @type("string") bottom = "";
  @type("string") bottomColor = "";
  @type("string") shoesColor = "";
  @type("string") pet = "";
  @type("string") petColor = "";
  @type(["string"]) accessories = new ArraySchema<string>();
}

/**
 * Objeto inteligente del mapa (Fase 6). Server autoritativo (sqlite): el admin
 * puede moverlo, duplicarlo o borrarlo y se propaga a todos en vivo.
 * `kind`: meet = TV, board = pizarra, wall/window/door = estructural.
 * `material`: wood | metal | glass | stone (aplica a wall/window/door).
 */
export class GameObject extends Schema {
  @type("string") id = "";
  @type("string") label = "";
  @type("string") kind = "board";
  @type("string") material = "wood";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") w = 0;
  @type("number") h = 0;
  @type("number") radius = 0;
  @type("string") url = "";
  /** Rotación en grados: 0 | 90 | 180 | 270. Snap a múltiplos de 90°. */
  @type("number") rotation = 0;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  /** Meet en vivo publicado por un usuario vinculado (Fase 4.5). "" = ninguno. */
  @type("string") meetUrl = "";
  /** Objetos inteligentes del mapa (Fase 6). Mutables solo por admin. */
  @type({ map: GameObject }) objects = new MapSchema<GameObject>();
}
