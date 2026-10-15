import React from "react";
import { Application, Container, Graphics, Text, FederatedPointerEvent } from "pixi.js";
import { CLIENT_SPEED, PLAYER_H, PLAYER_W, TILE } from "@quiiven/protocol";
import {
  moveWithCollision,
  parseMap,
  zoneAt,
  type GameMap,
} from "./mapLoader";
import { distancePx, isConnected } from "./proximity";
import { nearestObject, type SmartObject } from "./objects";
import { makeAvatarSprite, makeObjectSprite, makeTile as drawTileSprite } from "./sprites";
import type { SpatialAudio } from "./spatialAudio";
import type { NetHandle } from "./useColyseus";

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
  near: number;
  chunks: string;
  zoom: number;
}

interface Remote {
  c: Container;
  label: Text;
  ring: Graphics;
  cx: number;
  cy: number;
  connected: boolean;
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

function makeAvatar(color: number, name: string): { c: Container; label: Text; nub: Graphics; ring: Graphics } {
  const a = makeAvatarSprite(color, name);
  // Brand label: Cera Pro on a Carbón pill so names read on the light floor.
  a.label.style = { fontFamily: "Cera Pro, Montserrat, sans-serif", fontSize: 12, fontWeight: "500", fill: 0xffffff };
  a.label.resolution = 2;
  a.label.position.y = -7;
  const pill = new Graphics();
  const cx = a.label.position.x;
  const fitPill = () => {
    const w = a.label.width + 14;
    pill.clear().roundRect(cx - w / 2, -7 - a.label.height - 3, w, a.label.height + 6, 9).fill({ color: 0x2c2c33, alpha: 0.88 });
  };
  a.c.addChildAt(pill, a.c.getChildIndex(a.label));
  fitPill();
  // Re-measure once the frame renders and again when Cera Pro finishes loading.
  requestAnimationFrame(fitPill);
  void document.fonts?.ready.then(fitPill);
  pillFitters.set(a.label, fitPill);
  return a;
}

function paintRing(ring: Graphics, connected: boolean) {
  ring.clear();
  ring
    .roundRect(-4, -4, BODY_W + 8, BODY_H + 8, 8)
    .stroke({ color: connected ? 0x18d3b8 : 0x2c2c33, width: 2, alpha: connected ? 1 : 0 });
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

export function GameCanvas({ name, net, objects, isAdmin, adminMode, onNearby, onObject, audio }: { name: string; net: NetHandle; objects: SmartObject[]; isAdmin: boolean; adminMode: boolean; onNearby: (ids: string[]) => void; onObject: (obj: SmartObject | null) => void; audio: SpatialAudio | null }) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef(name);
  nameRef.current = name;
  const onNearbyRef = React.useRef(onNearby);
  onNearbyRef.current = onNearby;
  const onObjectRef = React.useRef(onObject);
  onObjectRef.current = onObject;
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
    fps: 0, x: 0, y: 0, dir: "down", anim: "idle", zone: "—", near: 0, chunks: "—", zoom: 1,
  });
  const debug = React.useMemo(
    () => new URLSearchParams(window.location.search).has("debug"),
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;
    const disposers: (() => void)[] = [];
    const keys = new Set<string>();

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
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
      const objectC = new Container();
      const avatarC = new Container();
      const roofC = new Container();
      world.addChild(groundC, objectC, avatarC, roofC);

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
          const label = new Text({
            text: `${o.label}${mode ? " ✋" : ""}`,
            style: {
              fontSize: 11,
              fill: 0xffffff,
              fontFamily: "system-ui, sans-serif",
              stroke: { color: 0x000000, width: 3 },
            },
          });
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

      const local = makeAvatar(0x4f8ff7, nameRef.current);
      avatarC.addChild(local.c);

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
        let vx = 0;
        let vy = 0;
        for (const k of keys) {
          vx += KEYS[k].x;
          vy += KEYS[k].y;
        }
        const moving = vx !== 0 || vy !== 0;
        if (moving) {
          const len = Math.hypot(vx, vy);
          // Colisión: estáticas del mapa + muros dinámicos (admin-added).
          // Ventanas y puertas NO bloquean movimiento.
          // AABB de un rectángulo rotado: w' = w·|cos θ| + h·|sin θ|,
          // h' = w·|sin θ| + h·|cos θ|. Funciona para cualquier ángulo.
          const dynamicWalls = objectsRef.current
            .filter((o) => o.kind === "wall")
            .map((o) => {
              const rad = ((o.rotation ?? 0) * Math.PI) / 180;
              const c = Math.abs(Math.cos(rad));
              const s = Math.abs(Math.sin(rad));
              const bw = o.w * c + o.h * s;
              const bh = o.w * s + o.h * c;
              const cx = o.x + o.w / 2;
              const cy = o.y + o.h / 2;
              return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
            });
          const next = moveWithCollision(
            pos,
            (vx / len) * SPEED * dt,
            (vy / len) * SPEED * dt,
            { w: BODY_W, h: BODY_H },
            [...map.collisions, ...dynamicWalls],
            { w: map.widthPx, h: map.heightPx },
          );
          pos.x = next.x;
          pos.y = next.y;
          dir = Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
          anim = "walk";
          drawNub(local.nub);
        } else {
          anim = "idle";
        }
        if (local.label.text !== nameRef.current) setLabel(local.label, nameRef.current);
        local.c.position.set(Math.round(pos.x), Math.round(pos.y));

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
        if (room) {
          const selfZone = { zoneId: myZone?.id ?? "", zoneKind: myZone?.kind ?? "" };
          room.state.players.forEach((p, id) => {
            if (id === net.sessionId) return;
            let r = remotes.get(id);
            if (!r) {
              const built = makeAvatar(0xf2a54a, p.name);
              r = { c: built.c, label: built.label, ring: built.ring, cx: p.x, cy: p.y, connected: false };
              paintRing(r.ring, false);
              avatarC.addChild(r.c);
              remotes.set(id, r);
            }
            if (r.label.text !== p.name) setLabel(r.label, p.name);
            const k = 1 - Math.exp(-12 * dt);
            r.cx += (p.x - r.cx) * k;
            r.cy += (p.y - r.cy) * k;
            r.c.position.set(Math.round(r.cx), Math.round(r.cy));

            const pz = map.zones.find((z) => z.id === p.zoneId);
            const connected = isConnected(
              selfZone,
              { zoneId: p.zoneId, zoneKind: pz?.kind ?? "" },
              distancePx({ x: cx0, y: cy0 }, { x: r.cx + BODY_W / 2, y: r.cy + BODY_H / 2 }),
              radiusPx,
            );
            if (connected !== r.connected) {
              r.connected = connected;
              paintRing(r.ring, connected);
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
              avatarC.removeChild(r.c);
              r.c.destroy(true);
              remotes.delete(id);
              audioRef.current?.detach(id);
            }
          }
        }

        // Follow camera with smoothing + clamp (en coords mundo, considerando zoom).
        const cx = pos.x + BODY_W / 2;
        const cy = pos.y + BODY_H / 2;
        const viewWz = viewW / zoom;
        const viewHz = viewH / zoom;
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
          lastNearCount = connectedIds.length;
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
        <span className="q-zone">
          {hud.zone === "—" ? "Área común" : <strong>{hud.zone.replace(/ \(.*\)$/, "")}</strong>}
        </span>
      </div>
      {debug && (
        <div className="q-debug">
          {hud.fps} fps · ({hud.x},{hud.y}) · {hud.dir}/{hud.anim} · zona: {hud.zone} · cerca: {hud.near} · chunks: {hud.chunks} · zoom {hud.zoom.toFixed(2)}×
        </div>
      )}
      {adminMode && (
        <div className="q-panel q-small" style={{ position: "absolute", top: 76, left: 16, zIndex: 10, pointerEvents: "none", padding: "8px 14px" }}>
          <strong>Modo edición:</strong> clic rota +30° · arrastra para mover · clic derecho borra
        </div>
      )}
    </div>
  );
}
