import React from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { CLIENT_SPEED, PLAYER_H, PLAYER_W } from "@quiiven/protocol";
import {
  moveWithCollision,
  parseMap,
  zoneAt,
  type GameMap,
} from "./mapLoader";
import { distancePx, isConnected } from "./proximity";
import { nearestObject, resolveObjects, type SmartObject } from "./objects";
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
  const c = new Container();
  const body = new Graphics();
  body.roundRect(0, 0, BODY_W, BODY_H, 6).fill({ color });
  body.circle(BODY_W / 2, 8, 5).fill({ color: 0xd7e6ff });
  const nub = new Graphics();
  const ring = new Graphics();
  const label = new Text({
    text: name,
    style: { fontFamily: "Cera Pro, Montserrat, sans-serif", fontSize: 12, fontWeight: "500", fill: 0xffffff },
    resolution: 2,
  });
  label.anchor.set(0.5, 1);
  label.position.set(BODY_W / 2, -7);
  // Carbon pill behind the name so it reads on the light floor.
  const pill = new Graphics();
  const fitPill = () => {
    const w = label.width + 14;
    pill.clear().roundRect(BODY_W / 2 - w / 2, -7 - label.height - 3, w, label.height + 6, 9).fill({ color: 0x2c2c33, alpha: 0.88 });
  };
  fitPill();
  pillFitters.set(label, fitPill);
  c.addChild(body, nub, ring, pill, label);
  return { c, label, nub, ring };
}

function paintRing(ring: Graphics, connected: boolean) {
  ring.clear();
  ring
    .roundRect(-4, -4, BODY_W + 8, BODY_H + 8, 8)
    .stroke({ color: connected ? 0x18d3b8 : 0x2c2c33, width: 2, alpha: connected ? 1 : 0 });
}

export function GameCanvas({ name, net, onNearby, onObject, audio }: { name: string; net: NetHandle; onNearby: (ids: string[]) => void; onObject: (obj: SmartObject | null) => void; audio: SpatialAudio | null }) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef(name);
  nameRef.current = name;
  const onNearbyRef = React.useRef(onNearby);
  onNearbyRef.current = onNearby;
  const onObjectRef = React.useRef(onObject);
  onObjectRef.current = onObject;
  const audioRef = React.useRef(audio);
  audioRef.current = audio;
  const [hud, setHud] = React.useState<Hud>({
    fps: 0, x: 0, y: 0, dir: "down", anim: "idle", zone: "—", near: 0, chunks: "—",
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
      const objects = resolveObjects(
        await fetch(`${import.meta.env.BASE_URL}objects.json`).then((r) => (r.ok ? r.json() : [])),
        import.meta.env.VITE_MEET_URL ?? "",
      );
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

      // Smart Object markers (amber) so they are discoverable on the map.
      for (const o of objects) {
        const m = new Graphics();
        m.roundRect(o.x, o.y, o.w, o.h, 6)
          .fill({ color: 0xffae00, alpha: 0.12 })
          .stroke({ color: MAP.object, width: 2 });
        const t = new Text({
          text: `✦ ${o.label}`,
          style: { fontFamily: "Cera Pro, Montserrat, sans-serif", fontSize: 11, fontWeight: "700", fill: 0x2c2c33 },
          resolution: 2,
        });
        t.position.set(o.x + 2, o.y - 16);
        m.addChild(t);
        objectC.addChild(m);
      }

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
      const remotes = new Map<string, Remote>();
      const radiusPx = Number(import.meta.env.VITE_PROXIMITY_RADIUS_TILES ?? 5) * map.tile;
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
          const next = moveWithCollision(
            pos,
            (vx / len) * SPEED * dt,
            (vy / len) * SPEED * dt,
            { w: BODY_W, h: BODY_H },
            map.collisions,
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
            // Avatar culling: hide remotes far outside viewport + radius.
            r.c.visible =
              r.cx + BODY_W > cam.x - radiusPx &&
              r.cx < cam.x + viewW + radiusPx &&
              r.cy + BODY_H > cam.y - radiusPx &&
              r.cy < cam.y + viewH + radiusPx;
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

        // Follow camera with smoothing + clamp.
        const cx = pos.x + BODY_W / 2;
        const cy = pos.y + BODY_H / 2;
        const tx = Math.min(Math.max(cx - viewW / 2, 0), Math.max(0, map.widthPx - viewW));
        const ty = Math.min(Math.max(cy - viewH / 2, 0), Math.max(0, map.heightPx - viewH));
        const k = Math.min(1, dt * 8);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        world.position.set(-Math.round(cam.x), -Math.round(cam.y));

        // Frustum culling: chunks vs viewport AABB.
        let visible = 0;
        for (const c of allChunks) {
          const b = c.bounds;
          const inView =
            b.x < cam.x + viewW && b.x + b.w > cam.x && b.y < cam.y + viewH && b.y + b.h > cam.y;
          c.gfx.visible = inView;
          if (inView) visible++;
        }

        if (now - lastHud > 250) {
          lastHud = now;
          audioRef.current?.setRadius(radiusPx);
          // Smart Object enter/leave (Fase 4).
          const near = nearestObject({ x: cx, y: cy }, objects);
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
        <img src={`${import.meta.env.BASE_URL}brand/logo-carbon.png`} alt="Quiiven" />
        <span className="q-zone">
          {hud.zone === "—" ? "Área común" : <strong>{hud.zone.replace(/ \(.*\)$/, "")}</strong>}
        </span>
      </div>
      {debug && (
        <div className="q-debug">
          {hud.fps} fps · ({hud.x},{hud.y}) · {hud.dir}/{hud.anim} · zona: {hud.zone} · cerca: {hud.near} · chunks: {hud.chunks}
        </div>
      )}
    </div>
  );
}
