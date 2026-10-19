import React from "react";
import { Application, Container, Graphics, Sprite, Text, Texture, FederatedPointerEvent } from "pixi.js";
import { CLIENT_SPEED, PLAYER_H, PLAYER_W, TILE, type Player } from "@quiiven/protocol";
import {
  moveWithCollision,
  overlaps,
  parseMap,
  zoneAt,
  type AABB,
  type GameMap,
  type Zone,
} from "./mapLoader";
import { buildNavGrid, findPath, type NavGrid, type Pt } from "./pathfind";
import { distancePx, isConnected } from "./proximity";
import { nearestObject, type SmartObject } from "./objects";
import { makeObjectSprite, makeTile as drawTileSprite } from "./sprites";
import { drawDecor, drawFloor } from "./decor";
import { avatarKey, sanitizeAvatar, type AvatarConfig } from "../avatar/config";
import { AVATAR_H, gridToCanvas, paintAvatar, paintFace, type Facing, type Frame, type Pose } from "../avatar/render";
import { paintPet } from "../avatar/pets";
import { paintDesk, type DeskCustom } from "../avatar/desk";
import { ANIM_BY_ACTIVITY, buildInteractables, nearestInteractable, type Interactable } from "./interactions";
import type { SpatialAudio } from "./spatialAudio";
import { canHear, gainFor, normalizeStatus, STATUSES, STATUS_META, type PresenceStatus } from "./status";
import { StatusIcon } from "../ui/StatusIcon";
import type { NetHandle, NetStatus } from "./useColyseus";

const SPEED = CLIENT_SPEED;
const BODY_W = PLAYER_W;
const BODY_H = PLAYER_H;
const CHUNK_TILES = 8;
const SEND_MS = 66; // ~15 Hz

const KEYS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

interface Hud {
  fps: number;
  x: number;
  y: number;
  dir: string;
  anim: string;
  zone: string;
  /** Area of the current room (ventas, marketing…), for the color dot. */
  area: string;
  near: number;
  chunks: string;
  zoom: number;
}

/** Lets the UI (rooms list, chat) walk the avatar somewhere by itself. */
export interface Nav {
  /** Walk to a room; "locked" if it is closed to you, "far" if unreachable. */
  goToZone(zoneId: string): "ok" | "locked" | "far";
  /** You were let into a closed room. */
  admit(zoneId: string): void;
}

export type DeskAction = { type: "claim" | "edit"; deskId: number; roomName: string };

interface Remote {
  c: Container;
  pet: Container;
  label: Text;
  view: AvatarView;
  cx: number;
  cy: number;
  connected: boolean;
  /** Cache key of the last applied avatar (skin/clothes/pet sync). */
  akey: string;
  /** Last presence status painted (ring + badge). */
  statusKey: string;
  /** Last playback level applied (audio gate by status). */
  level: number;
}

/** Real avatar published by a remote player; falls back to safe defaults. */
function avatarFromPlayer(p: Player): AvatarConfig {
  return sanitizeAvatar({
    body: p.body,
    height: p.height,
    build: p.build,
    skin: p.skin,
    hair: p.hair,
    hairColor: p.hairColor,
    facialHair: p.facialHair,
    top: p.top,
    topColor: p.topColor,
    bottom: p.bottom,
    bottomColor: p.bottomColor,
    shoesColor: p.shoesColor,
    accessories: [...p.accessories],
    pet: p.pet,
    petColor: p.petColor,
  });
}

// Brand palette for the map (manual Quiiven 2026): light neutral floor,
// Carbón walls, neutral rugs (rooms get area colors in step 2).
const MAP = {
  floorA: 0xf1f1f4,
  floorB: 0xe9e9ee,
  wall: 0x2c2c33,
  wallTop: 0x4a4a55,
  wallEdge: 0x2c2c33,
  rug: 0xe2e2e8,
  rugTop: 0xd3d3db,
  object: 0xe59a05,
} as const;

function drawTile(g: Graphics, gid: number, px: number, py: number, t: number) {
  if (drawFloor(g, gid, px, py, t)) return;
  if (gid === 1) {
    g.rect(px, py, t, t).fill({ color: (px / t + py / t) % 2 === 0 ? MAP.floorA : MAP.floorB });
  } else if (gid === 2) {
    g.rect(px, py, t, t).fill({ color: MAP.wall });
    g.rect(px, py, t, 6).fill({ color: MAP.wallTop });
    g.rect(px, py + t - 2, t, 2).fill({ color: MAP.wallEdge });
  } else if (gid === 3) {
    g.roundRect(px + 1, py + 1, t - 2, t - 2, 4).fill({ color: MAP.rug, alpha: 0.9 });
    g.rect(px + 1, py + 1, t - 2, 3).fill({ color: MAP.rugTop, alpha: 0.9 });
  } else {
    // Any other tile keeps the team's procedural sprite.
    drawTileSprite(g, px, py, t, gid);
  }
}

function buildLayer(
  map: GameMap,
  data: number[],
  parent: Container,
): { gfx: Graphics; bounds: { x: number; y: number; w: number; h: number } }[] {
  const chunkPx = CHUNK_TILES * map.tile;
  const cx = Math.ceil(map.widthPx / chunkPx);
  const cy = Math.ceil(map.heightPx / chunkPx);
  const chunks: { gfx: Graphics; bounds: { x: number; y: number; w: number; h: number } }[] = [];
  for (let j = 0; j < cy; j++) {
    for (let i = 0; i < cx; i++) {
      const g = new Graphics();
      const x0 = i * CHUNK_TILES;
      const y0 = j * CHUNK_TILES;
      for (let ty = y0; ty < Math.min(y0 + CHUNK_TILES, map.heightTiles); ty++) {
        for (let tx = x0; tx < Math.min(x0 + CHUNK_TILES, map.widthTiles); tx++) {
          const gid = data[ty * map.widthTiles + tx];
          if (gid !== 0) drawTile(g, gid, tx * map.tile, ty * map.tile, map.tile);
        }
      }
      parent.addChild(g);
      chunks.push({ gfx: g, bounds: { x: i * chunkPx, y: j * chunkPx, w: chunkPx, h: chunkPx } });
    }
  }
  return chunks;
}

const pillFitters = new WeakMap<Text, () => void>();

/** Updates a name label and resizes its background pill. */
function setLabel(label: Text, text: string) {
  label.text = text;
  pillFitters.get(label)?.();
}

/** Pixel avatars are painted at 1px per cell and scaled up crisply. */
const SPRITE_SCALE = 2;
const FACING_BY_DIR: Record<string, Facing> = { down: "front", up: "back", left: "left", right: "right" };
const WALK_CYCLE: Frame[] = [1, 0, 2, 0];
const textureCache = new Map<string, Texture>();

/**
 * Shared texture cache: avatar/pet sprites are repainted from the same Texture
 * across mounts, so callers must NEVER destroy the texture itself — only the
 * containers (`destroy({ children: true })`). As a safety net, a cache entry
 * whose texture was destroyed elsewhere is repainted on demand.
 */
function cachedTexture(key: string, paint: () => HTMLCanvasElement): Texture {
  let tex = textureCache.get(key);
  if (!tex || tex.destroyed) {
    if (tex) textureCache.delete(key);
    tex = Texture.from(paint());
    tex.source.scaleMode = "nearest";
    textureCache.set(key, tex);
  }
  return tex;
}

function avatarTexture(cfg: AvatarConfig, facing: Facing, frame: Frame, pose: Pose = "stand"): Texture {
  const key = `${avatarKey(cfg)}|${facing}|${frame}|${pose}`;
  return cachedTexture(key, () => gridToCanvas(paintAvatar(cfg, facing, frame, pose)));
}

function petTexture(cfg: AvatarConfig, left: boolean, frame: 0 | 1): Texture {
  const key = `pet|${cfg.pet}|${cfg.petColor}|${left}|${frame}`;
  return cachedTexture(key, () => gridToCanvas(paintPet(cfg.pet, cfg.petColor, left, frame)));
}

/** Network anim -> body pose; unknown values fall back to standing. */
function poseFromAnim(anim: string): Pose {
  return anim === "sit" || anim === "stretch" || anim === "drink" ? anim : "stand";
}
const BUBBLE: Partial<Record<Pose, string>> = { drink: "☕", stretch: "💪" };
const DIR_VEC: Record<string, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

interface AvatarView {
  c: Container;
  label: Text;
  nub: Graphics;
  ring: Graphics;
  /** Pet sprite; lives in the avatar layer but outside `c` so it can trail behind. */
  pet: Container;
  /** dir = down/up/left/right; walking animates the legs; pose comes from furniture. */
  setPose(dir: string, walking: boolean, nowMs: number, pose?: Pose): void;
  setConfig(cfg: AvatarConfig): void;
  /** Proximity ring (green when connected, status color otherwise). */
  setConnected(connected: boolean): void;
  /** Presence: status-colored ring + badge glyph; away dims the avatar. */
  setStatus(s: PresenceStatus): void;
  /** Moves the pet toward a spot next to/behind the owner's feet. */
  followPet(feetX: number, feetY: number, dir: string, idle: boolean, dt: number, nowMs: number): void;
}

function makeAvatar(cfg: AvatarConfig, name: string): AvatarView {
  const c = new Container();
  // Feet sit on the bottom of the collision box; the head rises above it.
  const footY = BODY_H + 2;
  const shadow = new Graphics().ellipse(BODY_W / 2, footY - 1, 11, 3.5).fill({ color: 0x2c2c33, alpha: 0.18 });
  const sprite = new Sprite(avatarTexture(cfg, "front", 0));
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(SPRITE_SCALE);
  sprite.position.set(BODY_W / 2, footY);
  // Direction is shown by the sprite itself; the old nub stays for API compatibility.
  const nub = new Graphics();
  nub.visible = false;
  const ring = new Graphics();

  const labelY = footY - AVATAR_H * SPRITE_SCALE + 6;
  const label = new Text({
    text: name,
    style: { fontFamily: "Cera Pro, Montserrat, sans-serif", fontSize: 12, fontWeight: "500", fill: 0xffffff },
    resolution: 2,
  });
  label.anchor.set(0.5, 1);
  label.position.set(BODY_W / 2, labelY);
  // Carbón pill behind the name so it reads on any floor.
  const pill = new Graphics();
  // Presence dot: status color at the start of the name.
  const dot = new Graphics();
  dot.visible = false;
  const fitPill = () => {
    const w = label.width + 14;
    pill.clear().roundRect(BODY_W / 2 - w / 2, labelY - label.height - 3, w, label.height + 6, 9).fill({ color: 0x2c2c33, alpha: 0.88 });
    dot.position.set(BODY_W / 2 - w / 2 - 9, labelY - label.height / 2 - 1);
  };
  fitPill();
  requestAnimationFrame(fitPill);
  void document.fonts?.ready.then(fitPill);
  pillFitters.set(label, fitPill);
  // Pixel speech bubble for activities (☕ drinking, 💪 stretching).
  const bubble = new Container();
  const bubbleBg = new Graphics()
    .roundRect(-13, -24, 26, 20, 7)
    .fill({ color: 0xffffff })
    .stroke({ color: 0x2c2c33, width: 1.5 })
    .poly([-4, -5, 4, -5, 0, 1])
    .fill({ color: 0xffffff });
  const bubbleIcon = new Text({ text: "", style: { fontSize: 12 }, resolution: 2 });
  bubbleIcon.anchor.set(0.5, 0.5);
  bubbleIcon.position.set(0, -14);
  bubble.addChild(bubbleBg, bubbleIcon);
  bubble.position.set(BODY_W / 2, labelY - 22);
  bubble.visible = false;
  c.addChild(shadow, ring, sprite, nub, pill, label, dot, bubble);

  const pet = new Container();
  const petSprite = new Sprite(petTexture(cfg, false, 0));
  petSprite.anchor.set(0.5, 1);
  petSprite.scale.set(SPRITE_SCALE);
  const petShadow = new Graphics().ellipse(0, -1, 9, 3).fill({ color: 0x2c2c33, alpha: 0.18 });
  pet.addChild(petShadow, petSprite);
  pet.visible = cfg.pet !== "ninguna";
  const petPos = { x: NaN, y: NaN, left: false, shown: "" };

  let current = cfg;
  let shown = "front|0|stand";
  let conn = false;
  let st: PresenceStatus = "available";
  const paintPresence = () => {
    ring.clear();
    if (st !== "available") {
      ring.ellipse(BODY_W / 2, BODY_H + 1, 15, 6).stroke({ color: STATUS_META[st].colorNum, width: 2 });
    } else if (conn) {
      ring.ellipse(BODY_W / 2, BODY_H + 1, 15, 6).stroke({ color: 0x18d3b8, width: 2 });
    }
    // Ausente: avatar atenuado.
    sprite.alpha = st === "away" ? 0.55 : 1;
    // Punto al inicio del nombre (oculto en Disponible).
    dot.clear();
    if (st !== "available") {
      dot.circle(0, 0, 4).fill({ color: STATUS_META[st].colorNum });
    }
    dot.visible = st !== "available";
  };
  return {
    c,
    label,
    nub,
    ring,
    pet,
    setConnected(b) {
      if (b === conn) return;
      conn = b;
      paintPresence();
    },
    setStatus(s) {
      if (s === st) return;
      st = s;
      paintPresence();
    },
    setPose(dir, walking, nowMs, pose = "stand") {
      const facing = FACING_BY_DIR[dir] ?? "front";
      const frame: Frame =
        pose === "stretch" ? (Math.floor(nowMs / 600) % 2 ? 1 : 0) : walking ? WALK_CYCLE[Math.floor(nowMs / 140) % WALK_CYCLE.length] : 0;
      const icon = BUBBLE[pose] ?? "";
      bubble.visible = icon !== "";
      if (icon && bubbleIcon.text !== icon) bubbleIcon.text = icon;
      const key = `${facing}|${frame}|${pose}`;
      if (key === shown) return;
      shown = key;
      sprite.texture = avatarTexture(current, facing, frame, pose);
    },
    setConfig(next) {
      if (avatarKey(next) === avatarKey(current)) return;
      current = next;
      shown = "";
      petPos.shown = "";
      pet.visible = next.pet !== "ninguna";
    },
    followPet(feetX, feetY, dir, idle, dt, nowMs) {
      if (!pet.visible) return;
      if (Number.isNaN(petPos.x)) {
        petPos.x = feetX + 22;
        petPos.y = feetY;
      }
      // Trail behind while walking; sit beside the owner when idle.
      const [vx, vy] = DIR_VEC[dir] ?? [0, 1];
      const tx = idle ? feetX + 22 : feetX - vx * 30 + vy * 14;
      const ty = idle ? feetY + 2 : feetY - vy * 24 + Math.abs(vx) * 4;
      const dx = tx - petPos.x;
      const dy = ty - petPos.y;
      const dist = Math.hypot(dx, dy);
      let moving = false;
      if (dist > 3) {
        const step = Math.min(dist, Math.max(90, dist * 5) * dt);
        petPos.x += (dx / dist) * step;
        petPos.y += (dy / dist) * step;
        moving = step > 0.4;
        if (Math.abs(dx) > 1) petPos.left = dx < 0;
      }
      const frame: 0 | 1 = moving && Math.floor(nowMs / 160) % 2 ? 1 : 0;
      const key = `${petPos.left}|${frame}`;
      if (key !== petPos.shown) {
        petPos.shown = key;
        petSprite.texture = petTexture(current, petPos.left, frame);
      }
      pet.position.set(Math.round(petPos.x), Math.round(petPos.y));
      pet.zIndex = pet.position.y - BODY_H;
    },
  };
}

interface ObjMarker {
  c: Container;
  id: string;
  label: Text;
  baseX: number;
  baseY: number;
  /** Rotación actual del objeto (deg, múltiplos de 30). */
  baseR: number;
  rotated: boolean;
  w: number;
  h: number;
}

export function GameCanvas({ name, avatar, myDesk, onDeskAction, locks, navRef, onZones, onZoneChange, onOccupancy, net, netStatus, objects, isAdmin, adminMode, onNearby, onObject, onPosition, onAdminModeChange, calendarOpen, onCalendarOpenChange, onEditProfile, audio, myStatus, onStatusChange }: { name: string; avatar: AvatarConfig; myDesk: DeskCustom | null; onDeskAction: (a: DeskAction) => void; locks: Record<string, string>; navRef: React.MutableRefObject<Nav | null>; onZones: (zones: Zone[]) => void; onZoneChange: (zone: Zone | null) => void; onOccupancy: (count: Record<string, number>) => void; net: NetHandle; netStatus?: NetStatus; objects: SmartObject[]; isAdmin: boolean; adminMode: boolean; onNearby: (ids: string[]) => void; onObject: (obj: SmartObject | null) => void; onPosition?: (x: number, y: number) => void; onAdminModeChange?: (on: boolean) => void; calendarOpen?: boolean; onCalendarOpenChange?: (on: boolean) => void; onEditProfile?: () => void; audio: SpatialAudio | null; myStatus?: string; onStatusChange?: (s: PresenceStatus) => void }) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  /** Set by the E key or the hint button; consumed by the game loop. */
  const interactRef = React.useRef(false);
  const [hint, setHint] = React.useState<{ label: string; active: boolean } | null>(null);
  /** Desk you are sitting at (to claim or customize it). */
  const [seatDesk, setSeatDesk] = React.useState<{ deskId: number; roomName: string } | null>(null);
  const myDeskRef = React.useRef(myDesk);
  myDeskRef.current = myDesk;
  const renderDeskRef = React.useRef<() => void>(() => undefined);
  React.useEffect(() => {
    renderDeskRef.current();
  }, [myDesk, name]);
  const avatarRef = React.useRef(avatar);
  avatarRef.current = avatar;
  const nameRef = React.useRef(name);
  nameRef.current = name;
  const onNearbyRef = React.useRef(onNearby);
  onNearbyRef.current = onNearby;
  // Own presence for the audio gate + local ring (ref: read inside the ticker).
  const myStatusRef = React.useRef<PresenceStatus>("available");
  myStatusRef.current = normalizeStatus(myStatus);
  const onObjectRef = React.useRef(onObject);
  onObjectRef.current = onObject;
  const onPositionRef = React.useRef(onPosition);
  onPositionRef.current = onPosition;
  const locksRef = React.useRef(locks);
  locksRef.current = locks;
  const zoneCbRef = React.useRef({ onZones, onZoneChange, onOccupancy });
  zoneCbRef.current = { onZones, onZoneChange, onOccupancy };
  const audioRef = React.useRef(audio);
  audioRef.current = audio;
  const objectsRef = React.useRef(objects);
  objectsRef.current = objects;
  const isAdminRef = React.useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const adminModeRef = React.useRef(adminMode);
  adminModeRef.current = adminMode;
  const rebuildRef = React.useRef<() => void>(() => undefined);
  React.useEffect(() => {
    rebuildRef.current();
  }, [objects, isAdmin, adminMode]);
  const [hud, setHud] = React.useState<Hud>({
    fps: 0, x: 0, y: 0, dir: "down", anim: "idle", zone: "—", area: "", near: 0, chunks: "—", zoom: 1,
  });
  const debug = React.useMemo(
    () => new URLSearchParams(window.location.search).has("debug"),
    [],
  );
  /** Mini foto del rostro para el botón de perfil del topbar. */
  const avatarIcon = React.useMemo(() => {
    try {
      return gridToCanvas(paintFace(avatar, "front")).toDataURL();
    } catch {
      return "";
    }
  }, [avatar]);
  // Pill de estado del topbar: muestra el actual y se expande a la derecha.
  const [statusOpen, setStatusOpen] = React.useState(false);
  const statusMeta = STATUS_META[normalizeStatus(myStatus)];

  React.useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;
    const disposers: (() => void)[] = [];
    const keys = new Set<string>();

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      // Typing in the chat or a form must not move the avatar.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "KeyE") {
        if (down && !e.repeat) interactRef.current = true;
        return;
      }
      if (!(e.code in KEYS)) return;
      e.preventDefault();
      if (down) keys.add(e.code);
      else keys.delete(e.code);
    };
    const downH = onKey(true);
    const upH = onKey(false);
    const blurH = () => keys.clear();
    window.addEventListener("keydown", downH);
    window.addEventListener("keyup", upH);
    window.addEventListener("blur", blurH);
    disposers.push(() => {
      window.removeEventListener("keydown", downH);
      window.removeEventListener("keyup", upH);
      window.removeEventListener("blur", blurH);
    });

    (async () => {
      const mapUrl = import.meta.env.VITE_MAP_DEFAULT ?? `${import.meta.env.BASE_URL}maps/demo.tmj`;
      const res = await fetch(mapUrl);
      if (!res.ok) throw new Error(`map fetch failed: ${mapUrl}`);
      const map = parseMap(await res.json());
      if (cancelled) return;

      app = new Application();
      // Transparent canvas: the white + brand gradient page shows around the map.
      await app.init({ backgroundAlpha: 0, resizeTo: mountRef.current!, antialias: true });
      if (cancelled) {
        app.destroy(true);
        return;
      }
      mountRef.current!.appendChild(app.canvas);

      const world = new Container();
      app.stage.eventMode = "static";
      app.stage.addChild(world);

      const groundC = new Container();
      const decorC = new Container();
      const canopyC = new Container();
      const objectC = new Container();
      const avatarC = new Container();
      const roofC = new Container();
      world.addChild(groundC, decorC, objectC, avatarC, canopyC, roofC);
      // Furniture from the map's decor layer; tree canopies go above avatars.
      for (const item of map.decor) {
        const { below, above } = drawDecor(item);
        decorC.addChild(below);
        if (above) canopyC.addChild(above);
      }
      // "Mi escritorio": the claimed desk is repainted on top with its owner's
      // decoration, chair color and a name tag.
      const myDeskC = new Container();
      decorC.addChild(myDeskC);
      const desksById = new Map(map.decor.filter((d) => d.type === "desk").map((d) => [d.id, d]));
      const renderMyDesk = () => {
        for (const ch of myDeskC.removeChildren()) ch.destroy({ children: true });
        const custom = myDeskRef.current;
        const desk = custom ? desksById.get(custom.deskId) : undefined;
        if (!custom || !desk) return;
        const facing = desk.props.facing === "up" ? "up" : "down";
        const glow = desk.props.color && /^#[0-9a-f]{6}$/i.test(desk.props.color) ? desk.props.color : "#18d3b8";
        const tex = Texture.from(gridToCanvas(paintDesk(custom, facing, glow)));
        tex.source.scaleMode = "nearest";
        const sprite = new Sprite(tex);
        sprite.position.set(desk.x, desk.y);
        sprite.width = desk.w;
        sprite.height = desk.h;
        // Chair recolored to the owner's choice (chair is one tile toward the person).
        const chairY = facing === "down" ? desk.y - desk.h : desk.y + desk.h;
        const chair = new Graphics();
        const cw = 22;
        const cx = desk.x + (desk.w - cw) / 2;
        chair.roundRect(cx, chairY + 9, cw, 14, 5).fill({ color: 0x4a4a55 }).stroke({ color: 0x2c2c33, width: 1 });
        chair.roundRect(cx + 3, chairY + 12, cw - 6, 8, 3).fill({ color: parseInt(custom.chairColor.slice(1), 16) });
        // Name tag on the edge facing the chair.
        const tag = new Text({
          text: nameRef.current.split(" ")[0],
          style: { fontFamily: "Cera Pro, Montserrat, sans-serif", fontSize: 9, fontWeight: "700", fill: 0xffffff },
          resolution: 2,
        });
        const tagW = tag.width + 10;
        const tagBg = new Graphics()
          .roundRect(0, 0, tagW, 13, 6)
          .fill({ color: 0x2c2c33 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
        const tagC = new Container();
        tagC.addChild(tagBg, tag);
        tag.position.set(5, 1);
        tagC.position.set(desk.x + desk.w / 2 - tagW / 2, facing === "down" ? desk.y - 6 : desk.y + desk.h - 7);
        myDeskC.addChild(chair, sprite, tagC);
      };
      renderDeskRef.current = renderMyDesk;
      renderMyDesk();

      const groundChunks = buildLayer(map, map.ground, groundC);
      const wallChunks = buildLayer(map, map.walls, objectC);
      const roofChunks = buildLayer(map, map.roof, roofC);
      const allChunks = [...groundChunks, ...wallChunks, ...roofChunks];

      const objMarkers = new Map<string, ObjMarker>();
      let dragState: { id: string; offsetX: number; offsetY: number } | null = null;
      // Pendiente: pointerdown sin drag todavía. Si se mueve más allá del
      // umbral, se promueve a dragState (mover). Si suelta sin moverse → click (rotar).
      let pendingDrag: {
        id: string;
        offsetX: number;
        offsetY: number;
        downX: number;
        downY: number;
        moved: boolean;
      } | null = null;
      const DRAG_THRESHOLD = 5; // px en pantalla

      const rebuildMarkers = () => {
        const objs = objectsRef.current;
        const mode = adminModeRef.current;
        for (const [, m] of objMarkers) {
          objectC.removeChild(m.c);
          m.c.destroy({ children: true });
        }
        objMarkers.clear();
        for (const o of objs) {
          const c = new Container();
          c.eventMode = mode ? "static" : "none";
          c.position.set(o.x, o.y);
          const rotation = ((o.rotation ?? 0) % 360 + 360) % 360;
          if (rotation !== 0) {
            // Rotar el sprite alrededor de su centro (que ahora está en o.w/2, o.h/2).
            c.pivot.set(o.w / 2, o.h / 2);
            c.position.set(o.x + o.w / 2, o.y + o.h / 2);
            c.rotation = (rotation * Math.PI) / 180;
          }
          const sprite = makeObjectSprite(o.kind, o.w, o.h, o.material);
          c.addChild(sprite);
          const structural = o.kind === "wall" || o.kind === "window" || o.kind === "door";
          const label = new Text({
            text: `${o.label}${mode ? " ✋" : ""}`,
            style: {
              fontSize: 11,
              fontWeight: "700",
              fill: 0xffffff,
              fontFamily: "Cera Pro, Montserrat, sans-serif",
              stroke: { color: 0x2c2c33, width: 3 },
            },
            resolution: 2,
          });
          // Walls/doors only show their name while editing; TVs and boards always do.
          label.visible = mode || !structural;
          label.anchor.set(0.5, 1);
          // El label sigue al lado "arriba" del bounding box rotado.
          const labelOffset = rotation === 90 || rotation === 270 ? o.h / 2 : o.w / 2;
          label.position.set(labelOffset, -6);
          c.addChild(label);
          if (mode) {
            c.cursor = "grab";
            c.on("pointerdown", (e: FederatedPointerEvent) => {
              // Click derecho = borrar (Fase 6 admin)
              if (e.button === 2) {
                net.sendObjRemove(o.id);
                return;
              }
              if (e.button !== 0) return;
              // Pendiente de drag: si el mouse se mueve más allá del umbral,
              // se convierte en drag (mover). Si suelta sin moverse, es click → rotar.
              const worldX = e.global.x + cam.x;
              const worldY = e.global.y + cam.y;
              pendingDrag = {
                id: o.id,
                offsetX: worldX - o.x,
                offsetY: worldY - o.y,
                downX: e.global.x,
                downY: e.global.y,
                moved: false,
              };
              c.cursor = "grabbing";
            });
          }
          objectC.addChild(c);
          objMarkers.set(o.id, { c, id: o.id, label, baseX: o.x, baseY: o.y, baseR: rotation, rotated: rotation !== 0, w: o.w, h: o.h });
        }
      };
      rebuildRef.current = rebuildMarkers;
      rebuildMarkers();

      app.stage.on("pointermove", (e: FederatedPointerEvent) => {
        if (!adminModeRef.current) return;
        // Promover pendingDrag → dragState si supera el umbral.
        if (pendingDrag && !pendingDrag.moved) {
          const dx = e.global.x - pendingDrag.downX;
          const dy = e.global.y - pendingDrag.downY;
          if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
            pendingDrag.moved = true;
            dragState = {
              id: pendingDrag.id,
              offsetX: pendingDrag.offsetX,
              offsetY: pendingDrag.offsetY,
            };
          }
        }
        if (!dragState) return;
        const m = objMarkers.get(dragState.id);
        if (!m) return;
        const worldX = e.global.x + cam.x;
        const worldY = e.global.y + cam.y;
        // Snap a grid (TILE=32) para que cada objeto caiga en un cuadrito.
        const nx = Math.round((worldX - dragState.offsetX) / TILE) * TILE;
        const ny = Math.round((worldY - dragState.offsetY) / TILE) * TILE;
        // Si el sprite está rotado, el container.position es el centro (no top-left).
        m.c.position.set(
          m.rotated ? nx + m.w / 2 : nx,
          m.rotated ? ny + m.h / 2 : ny,
        );
        m.baseX = nx;
        m.baseY = ny;
        const live = objectsRef.current.find((x) => x.id === m.id);
        if (live) { live.x = nx; live.y = ny; }
      });

      app.stage.on("pointerup", () => {
        if (dragState && adminModeRef.current) {
          // Era un drag → enviar posición final.
          const m = objMarkers.get(dragState.id);
          if (m) net.sendObjMove(m.id, m.baseX, m.baseY);
        } else if (pendingDrag && adminModeRef.current) {
          // Era un click simple (no drag) → rotar +30°.
          // Cubre los 360° en 12 clicks.
          const m = objMarkers.get(pendingDrag.id);
          if (m) {
            const cur = m.baseR ?? 0;
            const next = ((Math.round(cur / 30) * 30) % 360 + 360) % 360;
            const r = next === 0 ? 30 : next;
            net.sendObjRotate(pendingDrag.id, r);
          }
        }
        dragState = null;
        pendingDrag = null;
        for (const [, mk] of objMarkers) mk.c.cursor = "grab";
      });

      avatarC.sortableChildren = true;
      const local = makeAvatar(avatarRef.current, nameRef.current);
      avatarC.addChild(local.c, local.pet);
      const interactables = buildInteractables(map.decor, map.tile);
      let activity: Interactable | null = null;
      let activityUntil = 0;
      let beforeActivity = { x: 0, y: 0 };
      let lastHintKey = "";
      let lastOwnStatus: PresenceStatus = "available";
      let lastSeatDesk: number | null = null;

      // Debug overlay: collisions (red) + zones (blue).
      const overlay = new Graphics();
      for (const c of map.collisions) {
        overlay.rect(c.x, c.y, c.w, c.h).stroke({ color: 0xff5555, width: 1 });
      }
      for (const z of map.zones) {
        overlay.rect(z.x, z.y, z.w, z.h).stroke({ color: 0x55aaff, width: 1 });
        const t = new Text({
          text: z.label,
          style: { fontSize: 11, fill: 0x9cc8ff },
        });
        t.position.set(z.x + 4, z.y + 2);
        overlay.addChild(t);
      }
      overlay.visible = debug;
      world.addChild(overlay);

      const pos = {
        x: map.spawn.x - BODY_W / 2,
        y: map.spawn.y - BODY_H / 2,
      };
      // ?debug only: jump to a point (center of the avatar, in map px).
      if (debug)
        (window as unknown as { qTeleport?: (x: number, y: number) => void }).qTeleport = (x, y) => {
          pos.x = x - BODY_W / 2;
          pos.y = y - BODY_H / 2;
        };
      const cam = { x: 0, y: 0 };
      let zoom = 1;
      const remotes = new Map<string, Remote>();
      const radiusPx = Number(import.meta.env.VITE_PROXIMITY_RADIUS_TILES ?? 5) * map.tile;

      // Zoom con rueda del ratón (hacia el cursor).
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // World point bajo el cursor antes del zoom.
        const wx = (mx - world.position.x) / zoom;
        const wy = (my - world.position.y) / zoom;
        const factor = Math.pow(0.92, e.deltaY / 100);
        const newZoom = Math.min(2.5, Math.max(0.25, zoom * factor));
        // Ajustar cam para que (wx, wy) quede bajo el cursor tras el zoom.
        cam.x = wx - mx / newZoom;
        cam.y = wy - my / newZoom;
        zoom = newZoom;
        world.scale.set(zoom, zoom);
      };
      const canvas = app.canvas;
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      disposers.push(() => {
        canvas.removeEventListener("wheel", onWheel);
      });

      // ---- Click-to-move + "go to room" -------------------------------
      /** Rooms you may enter while closed (you were inside or got let in). */
      const admitted = new Set<string>();
      /** Everything the avatar can't walk through right now. */
      const blockers = (): AABB[] => {
        const dynamicWalls = objectsRef.current
          .filter((o) => o.kind === "wall")
          .map((o) => {
            // AABB of a rotated rect: w' = w·|cos θ| + h·|sin θ|, h' = w·|sin θ| + h·|cos θ|.
            const rad = ((o.rotation ?? 0) * Math.PI) / 180;
            const c = Math.abs(Math.cos(rad));
            const sn = Math.abs(Math.sin(rad));
            const bw = o.w * c + o.h * sn;
            const bh = o.w * sn + o.h * c;
            return { x: o.x + o.w / 2 - bw / 2, y: o.y + o.h / 2 - bh / 2, w: bw, h: bh };
          });
        // Closed rooms act as walls (unless you are already in the doorway).
        const body = { x: pos.x, y: pos.y, w: BODY_W, h: BODY_H };
        const closed = map.zones.filter(
          (z) => locksRef.current[z.id] !== undefined && !admitted.has(z.id) && !overlaps(body, z),
        );
        return [...map.collisions, ...dynamicWalls, ...closed];
      };
      let grid: { key: string; g: NavGrid } | null = null;
      const navGrid = (): NavGrid => {
        const key = `${objectsRef.current.length}|${objectsRef.current.map((o) => `${o.x},${o.y},${o.rotation}`).join(";").length}|${Object.keys(locksRef.current).filter((z) => !admitted.has(z)).sort().join(",")}`;
        if (!grid || grid.key !== key) grid = { key, g: buildNavGrid({ w: map.widthPx, h: map.heightPx }, { w: BODY_W, h: BODY_H }, blockers()) };
        return grid.g;
      };
      /** Waypoints for the avatar center; null = not walking by itself. */
      let path: Pt[] | null = null;
      /** Furniture to use on arrival (clicked a chair, the coffee machine…). */
      let pathUse: Interactable | null = null;
      let stuckMs = 0;
      const marker = new Graphics();
      marker.visible = false;
      world.addChild(marker);
      const showMarker = (x: number, y: number) => {
        marker.clear();
        marker.ellipse(0, 0, 11, 6).stroke({ color: 0x18d3b8, width: 2.5 });
        marker.ellipse(0, 0, 4, 2).fill({ color: 0x18d3b8 });
        marker.position.set(x, y);
        marker.alpha = 1;
        marker.visible = true;
      };
      const walkTo = (x: number, y: number, use: Interactable | null = null): boolean => {
        const p = findPath(navGrid(), { x: pos.x + BODY_W / 2, y: pos.y + BODY_H / 2 }, { x, y });
        if (!p) return false;
        path = p.length ? p : null;
        pathUse = use;
        stuckMs = 0;
        const end = p[p.length - 1] ?? { x, y };
        showMarker(end.x, end.y + BODY_H / 2);
        return true;
      };
      navRef.current = {
        goToZone: (zoneId) => {
          const z = map.zones.find((q) => q.id === zoneId);
          if (!z) return "far";
          if (locksRef.current[zoneId] !== undefined && !admitted.has(zoneId) && zoneAt(pos.x + BODY_W / 2, pos.y + BODY_H / 2, map.zones)?.id !== zoneId) return "locked";
          return walkTo(z.x + z.w / 2, z.y + z.h / 2) ? "ok" : "far";
        },
        admit: (zoneId) => {
          admitted.add(zoneId);
          grid = null;
        },
      };
      disposers.push(() => {
        navRef.current = null;
      });
      zoneCbRef.current.onZones(map.zones);
      let downAt: { x: number; y: number } | null = null;
      const toWorld = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / zoom + cam.x, y: (e.clientY - rect.top) / zoom + cam.y };
      };
      const onDown = (e: PointerEvent) => {
        downAt = e.button === 0 && !adminModeRef.current ? { x: e.clientX, y: e.clientY } : null;
      };
      const onUp = (e: PointerEvent) => {
        if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
        downAt = null;
        const w = toWorld(e);
        // Clicked on (or right next to) furniture: walk there and use it.
        const it = nearestInteractable(interactables, w.x, w.y + 6, 26);
        if (it) walkTo(it.x, it.y - BODY_H / 2, it);
        else walkTo(w.x, w.y);
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointerup", onUp);
      canvas.style.cursor = "pointer";
      disposers.push(() => {
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointerup", onUp);
      });
      let lastZoneId: string | null = null;
      let lastOcc = "";
      let dir = "down";
      let anim: string = "idle";
      let lastHud = 0;
      let lastSend = 0;
      let lastSent = "";
      let lastNearby = "";
      let lastNearCount = 0;
      let lastObjectId: string | null = null;

      const drawNub = (nub: Graphics) => {
        nub.clear();
        nub.fill({ color: 0x1d2c49 });
        if (dir === "up") nub.rect(BODY_W / 2 - 3, -3, 6, 5);
        else if (dir === "down") nub.rect(BODY_W / 2 - 3, BODY_H - 2, 6, 5);
        else if (dir === "left") nub.rect(-3, BODY_H / 2 - 3, 5, 6);
        else nub.rect(BODY_W - 2, BODY_H / 2 - 3, 5, 6);
        nub.fill();
      };
      drawNub(local.nub);

      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 0.05);
        const viewW = app!.screen.width;
        const viewH = app!.screen.height;
        const viewWz = viewW / zoom;
        const viewHz = viewH / zoom;
        let vx = 0;
        let vy = 0;
        for (const k of keys) {
          vx += KEYS[k].x;
          vy += KEYS[k].y;
        }
        // Keys always win over walking by itself.
        if (vx !== 0 || vy !== 0) path = null;
        let stepMax = Infinity;
        if (path && !keys.size) {
          const t = path[0];
          const dx = t.x - (pos.x + BODY_W / 2);
          const dy = t.y - (pos.y + BODY_H / 2);
          const d = Math.hypot(dx, dy);
          if (d < 1.5) {
            path.shift();
            if (!path.length) {
              path = null;
              marker.visible = false;
              // Arrived at a chair / coffee / mat: use it.
              if (pathUse) interactRef.current = true;
              pathUse = null;
            }
          } else {
            vx = dx / d;
            vy = dy / d;
            stepMax = d;
          }
        }
        if (marker.visible && !path) marker.visible = false;
        const moving = vx !== 0 || vy !== 0;
        const nowMs = performance.now();
        // Furniture: E (or the hint button) uses the nearest item or stands up;
        // moving also gets up. Drinks end by themselves after a few seconds.
        const stopActivity = () => {
          if (!activity) return;
          activity = null;
          pos.x = beforeActivity.x;
          pos.y = beforeActivity.y;
        };
        if (activity && (moving || (activityUntil && nowMs > activityUntil))) stopActivity();
        if (interactRef.current) {
          interactRef.current = false;
          if (activity) stopActivity();
          else {
            const it = nearestInteractable(interactables, pos.x + BODY_W / 2, pos.y + BODY_H, 44);
            if (it) {
              activity = it;
              activityUntil = it.activity === "drink" ? nowMs + 4000 : 0;
              beforeActivity = { x: pos.x, y: pos.y };
              pos.x = it.x - BODY_W / 2;
              pos.y = it.y - BODY_H;
              dir = it.dir;
            }
          }
        }
        if (moving && !activity) {
          const len = Math.hypot(vx, vy);
          // Map collisions + admin walls + closed rooms. Windows/doors don't block.
          const step = Math.min(SPEED * dt, stepMax);
          const next = moveWithCollision(
            pos,
            (vx / len) * step,
            (vy / len) * step,
            { w: BODY_W, h: BODY_H },
            blockers(),
            { w: map.widthPx, h: map.heightPx },
          );
          // Walking by itself but blocked (someone closed a door): give up.
          if (path) {
            stuckMs = Math.abs(next.x - pos.x) + Math.abs(next.y - pos.y) < 0.01 ? stuckMs + dt * 1000 : 0;
            if (stuckMs > 400) {
              path = null;
              pathUse = null;
            }
          }
          pos.x = next.x;
          pos.y = next.y;
          dir = Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
          anim = "walk";
          drawNub(local.nub);
        } else {
          anim = activity ? ANIM_BY_ACTIVITY[activity.activity] : "idle";
        }
        if (local.label.text !== nameRef.current) setLabel(local.label, nameRef.current);
        local.setConfig(avatarRef.current);
        // Own presence ring + badge (only repaints on change).
        if (myStatusRef.current !== lastOwnStatus) {
          lastOwnStatus = myStatusRef.current;
          local.setStatus(lastOwnStatus);
        }
        local.setPose(dir, anim === "walk", nowMs, poseFromAnim(anim));
        local.followPet(pos.x + BODY_W / 2, pos.y + BODY_H, dir, anim !== "walk", dt, nowMs);
        // Hint for the nearest usable furniture (or how to get up).
        {
          const near = activity ? null : nearestInteractable(interactables, pos.x + BODY_W / 2, pos.y + BODY_H, 44);
          const next = activity
            ? { label: activity.activity === "sit" ? "Levantarse" : "Terminar", active: true }
            : near
              ? { label: near.label, active: false }
              : null;
          const key = next ? `${next.label}|${next.active}` : "";
          if (key !== lastHintKey) {
            lastHintKey = key;
            setHint(next);
          }
          const deskId = activity?.deskId ?? null;
          if (deskId !== lastSeatDesk) {
            lastSeatDesk = deskId;
            const z = zoneAt(pos.x + BODY_W / 2, pos.y + BODY_H / 2, map.zones);
            setSeatDesk(deskId === null ? null : { deskId, roomName: z?.label ?? "" });
          }
        }
        local.c.position.set(Math.round(pos.x), Math.round(pos.y));
        local.c.zIndex = local.c.position.y;

        // Publish at ~15Hz when something changed (pos/dir/anim/zone).
        const now = performance.now();
        const cx0 = pos.x + BODY_W / 2;
        const cy0 = pos.y + BODY_H / 2;
        const myZone = zoneAt(cx0, cy0, map.zones);
        const myZoneId = myZone?.id ?? "";
        const snap = `${Math.round(pos.x)},${Math.round(pos.y)},${dir},${anim},${myZoneId}`;
        if (now - lastSend > SEND_MS && snap !== lastSent) {
          lastSend = now;
          lastSent = snap;
          net.sendMove({ x: Math.round(pos.x), y: Math.round(pos.y), dir, anim, zone: myZoneId });
        }

        // Remote avatars: create/update from room state + interpolate.
        // Proximity mock: green ring = connected (would get audio in Fase 3).
        const room = net.getRoom();
        const connectedIds: string[] = [];
        if (room?.state?.players) {
          const selfZone = { zoneId: myZone?.id ?? "", zoneKind: myZone?.kind ?? "" };
          room.state.players.forEach((p, id) => {
            if (id === net.sessionId) return;
            let r = remotes.get(id);
            if (!r) {
              // Skin real publicada por el jugador (con fallback seguro).
              const cfg = avatarFromPlayer(p);
              const built = makeAvatar(cfg, p.name);
              r = { c: built.c, pet: built.pet, label: built.label, view: built, cx: p.x, cy: p.y, connected: false, akey: avatarKey(cfg), statusKey: "", level: -1 };
              avatarC.addChild(r.c, r.pet);
              remotes.set(id, r);
            }
            if (r.label.text !== p.name) setLabel(r.label, p.name);
            // Si cambió su perfil (ropa, pelo, mascota), se refleja en vivo.
            {
              const cfg = avatarFromPlayer(p);
              const key = avatarKey(cfg);
              if (key !== r.akey) {
                r.akey = key;
                r.view.setConfig(cfg);
              }
            }
            const k = 1 - Math.exp(-12 * dt);
            r.cx += (p.x - r.cx) * k;
            r.cy += (p.y - r.cy) * k;
            r.c.position.set(Math.round(r.cx), Math.round(r.cy));
            r.view.setPose(p.dir, p.anim === "walk", now, poseFromAnim(p.anim));
            r.view.followPet(r.cx + BODY_W / 2, r.cy + BODY_H, p.dir, p.anim !== "walk", dt, now);
            r.c.zIndex = r.c.position.y;

            const pz = map.zones.find((z) => z.id === p.zoneId);
            const connected = isConnected(
              selfZone,
              { zoneId: p.zoneId, zoneKind: pz?.kind ?? "" },
              distancePx({ x: cx0, y: cy0 }, { x: r.cx + BODY_W / 2, y: r.cy + BODY_H / 2 }),
              radiusPx,
            );
            if (connected !== r.connected) {
              r.connected = connected;
              r.view.setConnected(connected);
            }
            // Presencia: aro + insignia por estado; el audio sigue esas reglas.
            const pst = normalizeStatus(p.status);
            if (pst !== r.statusKey) {
              r.statusKey = pst;
              r.view.setStatus(pst);
            }
            // Puerta de audio: sordo propio o peer bloqueado → 0; busy → 0.5.
            const lvl = canHear(myStatusRef.current) ? gainFor(pst) : 0;
            if (lvl !== r.level) {
              r.level = lvl;
              audioRef.current?.setLevel(id, lvl);
            }
            if (connected) connectedIds.push(id);
            // Audio espacial: posición relativa al oyente (Fase 3).
            audioRef.current?.setPosition(
              id,
              r.cx + BODY_W / 2 - cx0,
              r.cy + BODY_H / 2 - cy0,
            );
            // Avatar culling: hide remotes far outside viewport + radius (mundo).
            r.c.visible =
              r.cx + BODY_W > cam.x - radiusPx &&
              r.cx < cam.x + viewWz + radiusPx &&
              r.cy + BODY_H > cam.y - radiusPx &&
              r.cy < cam.y + viewHz + radiusPx;
          });
          for (const [id, r] of remotes) {
            if (!room.state.players.get(id)) {
              avatarC.removeChild(r.c, r.pet);
              // Solo contenedores: las texturas son compartidas (textureCache) y
              // destruirlas aquí envenenaría al resto de avatares (alphaMode null).
              r.c.destroy({ children: true });
              r.pet.destroy({ children: true });
              remotes.delete(id);
              audioRef.current?.detach(id);
            }
          }
        }

        // Follow camera with smoothing + clamp (en coords mundo, considerando zoom).
        const cx = pos.x + BODY_W / 2;
        const cy = pos.y + BODY_H / 2;
        const tx = Math.min(Math.max(cx - viewWz / 2, 0), Math.max(0, map.widthPx - viewWz));
        const ty = Math.min(Math.max(cy - viewHz / 2, 0), Math.max(0, map.heightPx - viewHz));
        const k = Math.min(1, dt * 8);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        world.position.set(-Math.round(cam.x * zoom), -Math.round(cam.y * zoom));

        // Frustum culling: chunks vs viewport AABB (mundo).
        let visible = 0;
        for (const c of allChunks) {
          const b = c.bounds;
          const inView =
            b.x < cam.x + viewWz && b.x + b.w > cam.x && b.y < cam.y + viewHz && b.y + b.h > cam.y;
          c.gfx.visible = inView;
          if (inView) visible++;
        }

        if (now - lastHud > 250) {
          lastHud = now;
          audioRef.current?.setRadius(radiusPx);
          // Smart Object enter/leave (Fase 4).
          const near = nearestObject({ x: cx, y: cy }, objectsRef.current);
          const nearId = near?.id ?? null;
          if (nearId !== lastObjectId) {
            lastObjectId = nearId;
            onObjectRef.current(near);
          }
          const z = zoneAt(cx, cy, map.zones);
          // Being inside a room when it gets closed keeps you allowed in it.
          for (const id of admitted) if (locksRef.current[id] === undefined) admitted.delete(id);
          if (z && locksRef.current[z.id] !== undefined) admitted.add(z.id);
          if ((z?.id ?? "") !== lastZoneId) {
            lastZoneId = z?.id ?? "";
            zoneCbRef.current.onZoneChange(z);
          }
          // People per room (for the rooms list).
          {
            const occ: Record<string, number> = {};
            if (z) occ[z.id] = 1;
            room?.state?.players?.forEach((p, id) => {
              if (id !== net.sessionId && p.zoneId) occ[p.zoneId] = (occ[p.zoneId] ?? 0) + 1;
            });
            const k = JSON.stringify(occ);
            if (k !== lastOcc) {
              lastOcc = k;
              zoneCbRef.current.onOccupancy(occ);
            }
          }
          lastNearCount = connectedIds.length;
          onPositionRef.current?.(Math.round(pos.x), Math.round(pos.y));
          const key = connectedIds.slice().sort().join(",");
          if (key !== lastNearby) {
            lastNearby = key;
            onNearbyRef.current(connectedIds.slice().sort());
          }
          setHud({
            fps: Math.round(app!.ticker.FPS),
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            dir,
            anim,
            zone: z ? `${z.label} (${z.kind})` : "—",
            area: z?.area ?? "",
            near: lastNearCount,
            chunks: `${visible}/${allChunks.length}`,
            zoom,
          });
        }
      });
    })().catch((err) => {
      console.error(err);
    });

    return () => {
      cancelled = true;
      disposers.forEach((d) => d());
      app?.destroy(true);
      app = null;
    };
  }, [debug, net]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      <div className="q-panel q-topbar">
        <img src={`${import.meta.env.BASE_URL}brand/logo-color.png`} alt="Quiiven" />
        <div style={{ position: "relative", pointerEvents: "auto" }}>
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            aria-expanded={statusOpen}
            aria-label={`Mi estado: ${statusMeta.label}. Cambiar estado`}
            title="Cambiar mi estado"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 8, border: "1px solid var(--q-line)", background: "var(--q-card, #fff)", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "inherit" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusMeta.color }} aria-hidden="true" />
            {statusMeta.label}
            <span style={{ fontSize: 10, opacity: 0.6 }} aria-hidden="true">{statusOpen ? "▴" : "▾"}</span>
          </button>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "calc(100% + 6px)",
              zIndex: 40,
              overflow: "hidden",
              maxWidth: statusOpen ? 360 : 0,
              opacity: statusOpen ? 1 : 0,
              transition: "max-width 0.25s ease, opacity 0.2s ease",
            }}
          >
            <div className="q-panel" role="radiogroup" aria-label="Mi estado" style={{ display: "flex", gap: 4, padding: 6, width: "max-content" }}>
              {STATUSES.map((id) => {
                const meta = STATUS_META[id];
                const on = id === statusMeta.id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={`${meta.label}: ${meta.desc}`}
                    onClick={() => {
                      onStatusChange?.(id);
                      setStatusOpen(false);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      minWidth: 58,
                      padding: "6px 4px",
                      borderRadius: 8,
                      border: `1px solid ${on ? meta.color : "var(--q-line)"}`,
                      boxShadow: on ? `0 0 0 1px ${meta.color}` : "none",
                      background: "transparent",
                      color: meta.color,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <StatusIcon id={id} size={16} />
                    <span style={{ color: "inherit" }}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {statusOpen && (
          <div
            onClick={() => setStatusOpen(false)}
            aria-hidden="true"
            style={{ position: "fixed", inset: 0, zIndex: 30, pointerEvents: "auto" }}
          />
        )}
        <span className="q-zone">
          {hud.area && <span className={`q-area-dot q-area-dot--${hud.area}`} aria-hidden="true" />}
          {hud.zone === "—" ? "Pasillo" : <strong>{hud.zone.replace(/ \(.*\)$/, "")}</strong>}
        </span>
        {netStatus && netStatus !== "online" && (
          <span className="q-chip" title={netStatus === "offline" ? "No hay conexión con el servidor" : undefined}>
            <span className={`q-dot q-dot--${netStatus}`} />
            {netStatus === "offline" ? "Sin conexión" : netStatus === "connecting" ? "Conectando…" : "Vista previa"}
          </span>
        )}
        <button
          type="button"
          onClick={() => onEditProfile?.()}
          title="Mi avatar (editar perfil)"
          aria-label="Editar mi avatar"
          style={{ marginLeft: "auto", pointerEvents: "auto", position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--q-line)", background: "transparent", cursor: "pointer", overflow: "hidden", padding: 0 }}
        >
          {avatarIcon && (
            <img src={avatarIcon} alt="" width={20} height={20} style={{ imageRendering: "pixelated", display: "block" }} />
          )}
          {myStatus && normalizeStatus(myStatus) !== "available" && (
            <span
              title={STATUS_META[normalizeStatus(myStatus)].label}
              style={{ position: "absolute", right: 2, bottom: 2, width: 8, height: 8, borderRadius: "50%", background: STATUS_META[normalizeStatus(myStatus)].color, border: "1px solid #fff" }}
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => onCalendarOpenChange?.(!calendarOpen)}
          title={calendarOpen ? "Ocultar calendario" : "Mostrar mi día (calendario y Meet)"}
          aria-pressed={calendarOpen}
          aria-label="Calendario"
          style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--q-line)", background: calendarOpen ? "var(--q-blue)" : "transparent", color: calendarOpen ? "#fff" : "inherit", cursor: "pointer" }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <rect x="2" y="3" width="12" height="11" rx="1.5" />
            <path d="M2 6.5h12" />
            <path d="M5.5 1.5v2.5M10.5 1.5v2.5" />
          </svg>
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => onAdminModeChange?.(!adminMode)}
              title={adminMode ? "Desactivar modo edición" : "Activar modo edición (arrastra para mover · clic rota · clic derecho borra)"}
              aria-pressed={adminMode}
              aria-label="Modo edición"
              style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--q-line)", background: adminMode ? "var(--q-teal)" : "transparent", color: adminMode ? "#fff" : "inherit", cursor: "pointer" }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <rect x="2" y="2" width="12" height="12" rx="1" />
                <path d="M2 7h5V14" />
                <path d="M9.5 7H14" />
              </svg>
            </button>
            <a
              href="#/admin"
              title="Abrir página de administración"
              style={{ pointerEvents: "auto", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid var(--q-line)", borderRadius: 8, padding: "4px 10px" }}
            >
              ⚙ Admin
            </a>
          </>
        )}
      </div>
      {seatDesk && (
        <button
          type="button"
          className="q-panel q-hint q-hint--desk"
          onClick={() =>
            onDeskAction(
              myDesk?.deskId === seatDesk.deskId
                ? { type: "edit", deskId: seatDesk.deskId, roomName: seatDesk.roomName }
                : { type: "claim", deskId: seatDesk.deskId, roomName: seatDesk.roomName },
            )
          }
        >
          <kbd aria-hidden="true">{myDesk?.deskId === seatDesk.deskId ? "✎" : "★"}</kbd>
          {myDesk?.deskId === seatDesk.deskId ? "Personalizar mi escritorio" : "Hacer mi escritorio"}
        </button>
      )}
      {hint && (
        <button
          type="button"
          className={`q-panel q-hint${hint.active ? " q-hint--active" : ""}`}
          onClick={() => {
            interactRef.current = true;
          }}
        >
          <kbd>E</kbd>
          {hint.label}
        </button>
      )}
      {debug && (
        <div className="q-debug">
          {hud.fps} fps · ({hud.x},{hud.y}) · {hud.dir}/{hud.anim} · zona: {hud.zone} · cerca: {hud.near} · chunks: {hud.chunks} · zoom {hud.zoom.toFixed(2)}×
        </div>
      )}
    </div>
  );
}
