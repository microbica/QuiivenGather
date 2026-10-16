import React from "react";
import { gridToCanvas } from "../avatar/render";
import {
  CHAIR_COLORS,
  DESK_ITEMS,
  DESK_MATERIALS,
  paintDesk,
  type DeskCustom,
  type DeskItem,
} from "../avatar/desk";

interface Props {
  value: DeskCustom;
  /** Room where the desk is, e.g. "MKT COL · Célula 1 Sara & Manu". */
  roomName?: string;
  onPreview?: (desk: DeskCustom) => void;
  onSave: (desk: DeskCustom) => void;
  onRelease: () => void;
  onClose: () => void;
}

/** Crisp pixel-art desk (optionally only one item, for thumbnails). */
function DeskCanvas({ desk, scale, label }: { desk: DeskCustom; scale: number; label?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const grid = React.useMemo(() => paintDesk(desk, "up"), [desk]);
  React.useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, grid.w, grid.h);
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

function ItemPicker({
  id,
  value,
  onChange,
  base,
  side,
}: {
  id: string;
  value: DeskItem;
  onChange: (v: DeskItem) => void;
  base: DeskCustom;
  side: "left" | "right";
}) {
  const options: { id: DeskItem; label: string }[] = [{ id: "ninguno", label: "Nada" }, ...DESK_ITEMS];
  return (
    <div className="q-thumbs q-thumbs--desk" role="radiogroup" aria-labelledby={id}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className="q-thumb"
          onClick={() => onChange(o.id)}
        >
          <DeskCanvas
            desk={{ ...base, left: side === "left" ? o.id : "ninguno", right: side === "right" ? o.id : "ninguno" }}
            scale={2}
          />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function DeskPanel({ value, roomName, onPreview, onSave, onRelease, onClose }: Props) {
  const [desk, setDesk] = React.useState<DeskCustom>(value);
  const update = (patch: Partial<DeskCustom>) => {
    const next = { ...desk, ...patch };
    setDesk(next);
    onPreview?.(next);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="q-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="q-panel q-profile" role="dialog" aria-modal="true" aria-labelledby="desk-title">
        <aside className="q-profile__stage">
          <div className="q-profile__aura" aria-hidden="true" />
          <div className="q-desk-preview">
            <span className="q-desk-chair" style={{ background: desk.chairColor }} aria-hidden="true" />
            <DeskCanvas desk={desk} scale={8} label="Vista previa de tu escritorio" />
          </div>
          {roomName && (
            <div className="q-profile__name">
              <span className="q-small">{roomName}</span>
            </div>
          )}
        </aside>

        <div className="q-profile__editor">
          <header className="q-profile__head">
            <div>
              <h2 id="desk-title">Mi escritorio</h2>
              <p className="q-small q-muted">Tu puesto en la oficina. Decóralo como quieras.</p>
            </div>
            <button type="button" className="q-btn q-btn--icon" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </header>

          <div className="q-profile__body">
            <div className="q-field">
              <h4 id="d-mat" className="q-eyebrow">
                Escritorio
              </h4>
              <div className="q-seg" role="radiogroup" aria-labelledby="d-mat">
                {DESK_MATERIALS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={desk.material === m.id}
                    className="q-seg__opt"
                    onClick={() => update({ material: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="q-field">
              <h4 id="d-chair" className="q-eyebrow">
                Silla
              </h4>
              <div className="q-swatches" role="radiogroup" aria-labelledby="d-chair">
                {CHAIR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={desk.chairColor === c}
                    aria-label={c}
                    className="q-swatch"
                    style={{ background: c }}
                    onClick={() => update({ chairColor: c })}
                  />
                ))}
              </div>
            </div>
            <div className="q-field">
              <h4 id="d-left" className="q-eyebrow">
                Lado izquierdo
              </h4>
              <ItemPicker id="d-left" side="left" base={desk} value={desk.left} onChange={(left) => update({ left })} />
            </div>
            <div className="q-field">
              <h4 id="d-right" className="q-eyebrow">
                Lado derecho
              </h4>
              <ItemPicker id="d-right" side="right" base={desk} value={desk.right} onChange={(right) => update({ right })} />
            </div>
          </div>

          <footer className="q-profile__foot" style={{ justifyContent: "space-between" }}>
            <button type="button" className="q-btn q-btn--ghost" onClick={onRelease} style={{ color: "var(--q-flame)" }}>
              Dejar este escritorio
            </button>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="q-btn q-btn--ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="q-btn q-btn--primary" onClick={() => onSave(desk)}>
                Guardar
              </button>
            </span>
          </footer>
        </div>
      </section>
    </div>
  );
}
