// Click-to-move: A* over a lattice of avatar-center points every STEP px.
// A lattice point is walkable when the avatar box centered on it does not
// touch any blocker. Pure logic (no Pixi) so it is unit-testable.
import type { AABB } from "./mapLoader";

/** Lattice spacing. 16px keeps 1-tile (32px) doorways passable for a 20x28 body. */
export const STEP = 16;

export interface NavGrid {
  cols: number;
  rows: number;
  /** 1 = walkable. Index = row * cols + col; point = (col * STEP, row * STEP). */
  open: Uint8Array;
}

export interface Pt {
  x: number;
  y: number;
}

/** Marks every lattice point whose body box would overlap a blocker as closed. */
export function buildNavGrid(
  size: { w: number; h: number },
  body: { w: number; h: number },
  blockers: AABB[],
): NavGrid {
  const cols = Math.floor(size.w / STEP) + 1;
  const rows = Math.floor(size.h / STEP) + 1;
  const open = new Uint8Array(cols * rows);
  const hw = body.w / 2;
  const hh = body.h / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * STEP;
      const y = r * STEP;
      // Inside the map with the whole body.
      if (x - hw >= 0 && y - hh >= 0 && x + hw <= size.w && y + hh <= size.h) open[r * cols + c] = 1;
    }
  }
  for (const b of blockers) {
    // Points strictly inside the blocker grown by half the body are closed
    // (strict, matching overlaps() in mapLoader).
    const c0 = Math.max(0, Math.floor((b.x - hw) / STEP));
    const c1 = Math.min(cols - 1, Math.ceil((b.x + b.w + hw) / STEP));
    const r0 = Math.max(0, Math.floor((b.y - hh) / STEP));
    const r1 = Math.min(rows - 1, Math.ceil((b.y + b.h + hh) / STEP));
    for (let r = r0; r <= r1; r++) {
      const y = r * STEP;
      if (!(y > b.y - hh && y < b.y + b.h + hh)) continue;
      for (let c = c0; c <= c1; c++) {
        const x = c * STEP;
        if (x > b.x - hw && x < b.x + b.w + hw) open[r * cols + c] = 0;
      }
    }
  }
  return { cols, rows, open };
}

const isOpen = (g: NavGrid, c: number, r: number) => c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.open[r * g.cols + c] === 1;

/** Closest walkable lattice point to (x, y) within `maxRings` steps, or null. */
export function nearestOpen(g: NavGrid, x: number, y: number, maxRings = 12): { c: number; r: number } | null {
  const c0 = Math.round(x / STEP);
  const r0 = Math.round(y / STEP);
  let best: { c: number; r: number } | null = null;
  let bestD = Infinity;
  for (let ring = 0; ring <= maxRings; ring++) {
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== ring || !isOpen(g, c, r)) continue;
        const d = Math.hypot(c * STEP - x, r * STEP - y);
        if (d < bestD) {
          bestD = d;
          best = { c, r };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** True when the avatar can walk straight from a to b (sampled every 4px). */
export function lineClear(g: NavGrid, a: Pt, b: Pt): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
  for (let i = 1; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    // A point between lattice nodes is clear when its 4 surrounding nodes are.
    const c = Math.floor(x / STEP);
    const r = Math.floor(y / STEP);
    const fx = x / STEP - c;
    const fy = y / STEP - r;
    if (!isOpen(g, c, r)) return false;
    if (fx > 0 && !isOpen(g, c + 1, r)) return false;
    if (fy > 0 && !isOpen(g, c, r + 1)) return false;
    if (fx > 0 && fy > 0 && !isOpen(g, c + 1, r + 1)) return false;
  }
  return true;
}

/**
 * A* from `from` to `to` (avatar centers, px). Returns smoothed waypoints
 * (excluding the start) or null when unreachable. A blocked target snaps to
 * the closest walkable point around it.
 */
export function findPath(g: NavGrid, from: Pt, to: Pt): Pt[] | null {
  const s = nearestOpen(g, from.x, from.y, 6);
  const t = nearestOpen(g, to.x, to.y);
  if (!s || !t) return null;
  const N = g.cols * g.rows;
  const start = s.r * g.cols + s.c;
  const goal = t.r * g.cols + t.c;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - t.c);
    const dy = Math.abs(Math.floor(i / g.cols) - t.r);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  // Binary heap of [f, index].
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0][1];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  gScore[start] = 0;
  push(h(start), start);
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (!isOpen(g, nc, nr)) continue;
        // No corner cutting: diagonals need both side neighbors open.
        if (dc && dr && (!isOpen(g, cc + dc, cr) || !isOpen(g, cc, cr + dr))) continue;
        const ni = nr * g.cols + nc;
        if (closed[ni]) continue;
        const ng = gScore[cur] + (dc && dr ? Math.SQRT2 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          push(ng + h(ni), ni);
        }
      }
    }
  }
  if (!found) return null;
  const raw: Pt[] = [];
  for (let i = goal; i !== -1; i = came[i]) raw.push({ x: (i % g.cols) * STEP, y: Math.floor(i / g.cols) * STEP });
  raw.reverse();
  // String pulling: keep only the points where the straight line breaks.
  const out: Pt[] = [];
  let anchor: Pt = from;
  for (let i = 0; i < raw.length; i++) {
    const next = raw[i + 1];
    if (next && lineClear(g, anchor, next)) continue;
    out.push(raw[i]);
    anchor = raw[i];
  }
  return out;
}
