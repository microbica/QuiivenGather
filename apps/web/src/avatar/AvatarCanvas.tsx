import React from "react";
import type { AvatarConfig } from "./config";
import { AVATAR_H, AVATAR_W, gridToCanvas, paintAvatar, type Facing, type Frame, type PixelGrid } from "./render";
import { paintPet } from "./pets";
import type { Pet } from "./config";

interface Props {
  cfg: AvatarConfig;
  facing?: Facing;
  frame?: Frame;
  /** CSS pixels per avatar pixel. */
  scale?: number;
  /** Only show the top N rows (e.g. the head for hair thumbnails). */
  cropTop?: number;
  cropRows?: number;
  label?: string;
}

/** Crisp pixel-art avatar for the DOM (profile preview and option thumbnails). */
export function AvatarCanvas({ cfg, facing = "front", frame = 0, scale = 4, cropTop = 0, cropRows, label }: Props) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const rows = cropRows ?? AVATAR_H - cropTop;

  React.useEffect(() => {
    const out = ref.current;
    const ctx = out?.getContext("2d");
    if (!out || !ctx) return;
    const src = gridToCanvas(paintAvatar(cfg, facing, frame));
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, cropTop, AVATAR_W, rows, 0, 0, AVATAR_W, rows);
  }, [cfg, facing, frame, cropTop, rows]);

  return (
    <canvas
      ref={ref}
      width={AVATAR_W}
      height={rows}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: AVATAR_W * scale, height: rows * scale, imageRendering: "pixelated", display: "block" }}
    />
  );
}

/** Crisp pixel-art pet for the profile (thumbnails and next to the preview). */
export function PetCanvas({ pet, color, scale = 4, label }: { pet: Pet; color: string; scale?: number; label?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const grid: PixelGrid = React.useMemo(() => paintPet(pet, color), [pet, color]);
  React.useEffect(() => {
    const out = ref.current;
    const ctx = out?.getContext("2d");
    if (!out || !ctx) return;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(gridToCanvas(grid), 0, 0);
  }, [grid]);
  return (
    <canvas
      ref={ref}
      width={grid.w}
      height={grid.h}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: grid.w * scale, height: grid.h * scale, imageRendering: "pixelated", display: "block" }}
    />
  );
}
