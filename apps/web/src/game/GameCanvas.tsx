import React from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import {
  moveWithCollision,
  parseMap,
  zoneAt,
  type GameMap,
} from "./mapLoader";

const SPEED = 170; // px/s
const BODY_W = 20;
const BODY_H = 28;
const CHUNK_TILES = 8;

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
  chunks: string;
}

function drawTile(g: Graphics, gid: number, px: number, py: number, t: number) {
  if (gid === 1) {
    g.rect(px, py, t, t).fill({ color: (px / t + py / t) % 2 === 0 ? 0x262c38 : 0x222834 });
  } else if (gid === 2) {
    g.rect(px, py, t, t).fill({ color: 0x4a5265 });
    g.rect(px, py, t, 5).fill({ color: 0x707a94 });
    g.rect(px, py + t - 3, t, 3).fill({ color: 0x333948 });
  } else if (gid === 3) {
    g.rect(px, py, t, t).fill({ color: 0x8a5f3c, alpha: 0.92 });
    g.rect(px, py, t, 4).fill({ color: 0xb98a5a, alpha: 0.92 });
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

export function GameCanvas({ name = "Tú" }: { name?: string }) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [hud, setHud] = React.useState<Hud>({
    fps: 0, x: 0, y: 0, dir: "down", anim: "idle", zone: "—", chunks: "—",
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
    window.addEventListener("keydown", downH);
    window.addEventListener("keyup", upH);
    window.addEventListener("blur", () => keys.clear());
    disposers.push(() => {
      window.removeEventListener("keydown", downH);
      window.removeEventListener("keyup", upH);
    });

    (async () => {
      const mapUrl = import.meta.env.VITE_MAP_DEFAULT ?? "/maps/demo.tmj";
      const res = await fetch(mapUrl);
      if (!res.ok) throw new Error(`map fetch failed: ${mapUrl}`);
      const map = parseMap(await res.json());
      if (cancelled) return;

      app = new Application();
      await app.init({ background: "#14161c", resizeTo: mountRef.current! });
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

      // Avatar placeholder: rounded body + facing nub + name.
      const avatar = new Container();
      const body = new Graphics();
      body.roundRect(0, 0, BODY_W, BODY_H, 6).fill({ color: 0x4f8ff7 });
      body.circle(BODY_W / 2, 8, 5).fill({ color: 0xd7e6ff });
      const nub = new Graphics();
      const label = new Text({
        text: name,
        style: { fontSize: 12, fill: 0xffffff },
      });
      label.anchor.set(0.5, 1);
      label.position.set(BODY_W / 2, -4);
      avatar.addChild(body, nub, label);
      avatarC.addChild(avatar);

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
      let dir = "down";
      let lastHud = 0;

      const drawNub = () => {
        nub.clear();
        nub.fill({ color: 0x1d2c49 });
        if (dir === "up") nub.rect(BODY_W / 2 - 3, -3, 6, 5);
        else if (dir === "down") nub.rect(BODY_W / 2 - 3, BODY_H - 2, 6, 5);
        else if (dir === "left") nub.rect(-3, BODY_H / 2 - 3, 5, 6);
        else nub.rect(BODY_W - 2, BODY_H / 2 - 3, 5, 6);
        nub.fill();
      };
      drawNub();

      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 0.05);
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
          drawNub();
        }
        avatar.position.set(Math.round(pos.x), Math.round(pos.y));

        // Follow camera with smoothing + clamp.
        const viewW = app!.screen.width;
        const viewH = app!.screen.height;
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

        const now = performance.now();
        if (now - lastHud > 250) {
          lastHud = now;
          const z = zoneAt(cx, cy, map.zones);
          setHud({
            fps: Math.round(app!.ticker.FPS),
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            dir,
            anim: moving ? "walk" : "idle",
            zone: z ? `${z.label} (${z.kind})` : "—",
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
  }, [debug, name]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute", top: 12, left: 12, pointerEvents: "none",
          background: "rgba(10,12,18,0.72)", color: "#e8ecf4", fontSize: 13,
          fontFamily: "system-ui", padding: "8px 12px", borderRadius: 8, lineHeight: 1.5,
        }}
      >
        <div><strong>gatherQuiiven</strong> · Fase 1 · WASD / flechas · <code>?debug</code> colisiones</div>
        <div>
          {hud.fps} fps · ({hud.x},{hud.y}) · {hud.dir}/{hud.anim} · zona: {hud.zone} · chunks: {hud.chunks}
        </div>
      </div>
    </div>
  );
}
