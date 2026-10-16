// Furniture the avatar can use: sit on chairs/sofas/benches/seats/bikes, grab
// a coffee or water, stretch on a mat. Pure logic (no Pixi) so it is testable.
import type { DecorItem } from "./mapLoader";

export type Activity = "sit" | "drink" | "stretch";

export interface Interactable {
  id: string;
  activity: Activity;
  /** Where the avatar's feet go (px). */
  x: number;
  y: number;
  /** Direction the avatar faces while using it (down/up/left/right). */
  dir: string;
  /** Short verb shown in the hint, e.g. "Sentarse". */
  label: string;
  /** For desk chairs: the decor id of the desk in front of it. */
  deskId?: number;
}

/** Network anim value for each activity (validated by the server). */
export const ANIM_BY_ACTIVITY: Record<Activity, string> = { sit: "sit", drink: "drink", stretch: "stretch" };

export function buildInteractables(decor: DecorItem[], tile: number): Interactable[] {
  const out: Interactable[] = [];
  const desks = decor.filter((d) => d.type === "desk");
  decor.forEach((d, i) => {
    const facing = d.props.facing === "up" ? "up" : "down";
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    const add = (activity: Activity, x: number, y: number, dir: string, label: string, n = 0) =>
      out.push({ id: `${d.type}-${i}-${n}`, activity, x, y, dir, label });
    switch (d.type) {
      case "chair":
        // A 2-tile desk chair is one seat; meeting chairs are 1 tile each.
        if (d.w > tile * 1.5 && d.w <= tile * 2) {
          add("sit", cx, cy + 8, facing, "Sentarse");
          // The desk sits right below a "down" chair, right above an "up" one.
          const deskY = facing === "down" ? d.y + tile : d.y - tile;
          const desk = desks.find((k) => k.x === d.x && k.y === deskY && k.props.exec !== "true");
          if (desk) out[out.length - 1].deskId = desk.id;
        }
        else for (let x = d.x, n = 0; x < d.x + d.w; x += tile, n++) add("sit", x + tile / 2, cy + 8, facing, "Sentarse", n);
        break;
      case "seat":
        add("sit", cx, cy + 6, "up", "Sentarse");
        break;
      case "sofa":
      case "bench": {
        const vertical = d.props.vertical === "true";
        const len = vertical ? d.h : d.w;
        const n = Math.max(1, Math.floor(len / tile));
        for (let k = 0; k < n; k++) {
          const along = (k + 0.5) * (len / n);
          if (vertical) add("sit", d.x + d.w / 2, d.y + along + 8, d.x < 1600 ? "right" : "left", "Sentarse", k);
          else add("sit", d.x + along, cy + 8, "down", "Sentarse", k);
        }
        break;
      }
      case "bike":
        add("sit", cx, cy + 6, "left", "Pedalear");
        break;
      case "coffee":
        add("drink", cx - tile, cy + tile / 2, "right", "Tomar un café");
        break;
      case "water":
        add("drink", cx, d.y + d.h + tile * 0.75, "up", "Tomar agua");
        break;
      case "mat":
        add("stretch", cx, cy + 10, "down", "Estirarse");
        break;
      default:
        break;
    }
  });
  return out;
}

/** Closest interactable to the avatar's feet within `max` px, or null. */
export function nearestInteractable(list: Interactable[], x: number, y: number, max = 40): Interactable | null {
  let best: Interactable | null = null;
  let bestD = max;
  for (const it of list) {
    const d = Math.hypot(it.x - x, it.y - y);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}
