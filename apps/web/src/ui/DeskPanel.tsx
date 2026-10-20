import React from "react";
import { gridToCanvas } from "../avatar/render";
import {
  CHAIR_COLORS,
  CHAIR_STYLES,
  DESK_CATEGORIES,
  DESK_ITEMS,
  DESK_MATERIALS,
  DESK_SETUPS,
  FLOOR_CATEGORIES,
  FLOOR_ITEMS,
  paintChair,
  paintDeskScene,
  paintFloorThumb,
  paintItemThumb,
  type DeskCategory,
  type DeskCustom,
  type DeskItem,
  type FloorCategory,
  type FloorItem,
  type PixelGrid,
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

type Tab = "mesa" | "silla" | "encima" | "piso";
const TABS: { id: Tab; label: string }[] = [
  { id: "mesa", label: "Escritorio" },
  { id: "silla", label: "Silla" },
  { id: "encima", label: "Sobre la mesa" },
  { id: "piso", label: "Junto a la silla" },
];

/** Crisp pixel-art canvas for any painted grid. */
function Pixels({ grid, scale, label }: { grid: PixelGrid; scale: number; label?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
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

function Chips<T extends string>({ items, value, onChange, label }: { items: { id: T; icon: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="q-desk-chips" role="tablist" aria-label={label}>
      {items.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={value === c.id} className="q-chat__tab" onClick={() => onChange(c.id)}>
          <span aria-hidden="true">{c.icon}</span> {c.id}
        </button>
      ))}
    </div>
  );
}

function ThumbGrid<T extends string>({
  options,
  value,
  onChange,
  paint,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  paint: (id: T) => PixelGrid;
  label: string;
}) {
  return (
    <div className="q-thumbs q-thumbs--desk" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="q-thumb" onClick={() => onChange(o.id)}>
          <span className="q-desk-thumb">
            <Pixels grid={paint(o.id)} scale={3} />
          </span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function DeskPanel({ value, roomName, onPreview, onSave, onRelease, onClose }: Props) {
  const [desk, setDesk] = React.useState<DeskCustom>(value);
  const [tab, setTab] = React.useState<Tab>("encima");
  const [side, setSide] = React.useState<"left" | "right">("left");
  const [cat, setCat] = React.useState<DeskCategory>("Plantas");
  const [floorCat, setFloorCat] = React.useState<FloorCategory>("Plantas grandes");
  const update = (patch: Partial<DeskCustom>) => {
    const next = { ...desk, ...patch };
    setDesk(next);
    onPreview?.(next);
  };
  const scene = React.useMemo(() => paintDeskScene(desk), [desk]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const none = { id: "ninguno" as const, label: "Nada" };
  const surface: { id: DeskItem; label: string }[] = [none, ...DESK_ITEMS.filter((i) => i.group === cat)];
  const floor: { id: FloorItem; label: string }[] = [none, ...FLOOR_ITEMS.filter((i) => i.group === floorCat)];
  const sideValue = side === "left" ? desk.left : desk.right;
  const labelOf = (id: DeskItem) => (id === "ninguno" ? "nada" : DESK_ITEMS.find((i) => i.id === id)?.label.toLowerCase());

  return (
    <div className="q-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="q-panel q-profile" role="dialog" aria-modal="true" aria-labelledby="desk-title">
        <aside className="q-profile__stage">
          <div className="q-profile__aura" aria-hidden="true" />
          <div className="q-desk-preview">
            <Pixels grid={scene} scale={7} label="Vista previa de tu escritorio" />
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
              <p className="q-small q-muted">Tu puesto dentro de tu equipo. Organízalo a tu gusto.</p>
            </div>
            <button type="button" className="q-btn q-btn--icon" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </header>

          <div className="q-tabs" role="tablist" aria-label="Personalizar escritorio">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="q-tab" onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="q-profile__body">
            {tab === "mesa" && (
              <>
                <div className="q-field">
                  <h4 id="d-mat" className="q-eyebrow">Material</h4>
                  <div className="q-seg" role="radiogroup" aria-labelledby="d-mat">
                    {DESK_MATERIALS.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={desk.material === m.id} className="q-seg__opt" onClick={() => update({ material: m.id })}>
                        <span className="q-desk-swatch" style={{ background: m.top }} aria-hidden="true" />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="q-field">
                  <h4 id="d-setup" className="q-eyebrow">Equipo de trabajo</h4>
                  <div className="q-seg" role="radiogroup" aria-labelledby="d-setup">
                    {DESK_SETUPS.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={desk.setup === m.id} className="q-seg__opt" onClick={() => update({ setup: m.id })}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "silla" && (
              <>
                <div className="q-field">
                  <h4 id="d-chair-style" className="q-eyebrow">Estilo</h4>
                  <div className="q-thumbs q-thumbs--desk" role="radiogroup" aria-labelledby="d-chair-style">
                    {CHAIR_STYLES.map((c) => (
                      <button key={c.id} type="button" role="radio" aria-checked={desk.chairStyle === c.id} className="q-thumb" onClick={() => update({ chairStyle: c.id })}>
                        <span className="q-desk-thumb">
                          <Pixels grid={paintChair(c.id, desk.chairColor, "down")} scale={4} />
                        </span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="q-field">
                  <h4 id="d-chair" className="q-eyebrow">Color</h4>
                  <div className="q-swatches" role="radiogroup" aria-labelledby="d-chair">
                    {CHAIR_COLORS.map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={desk.chairColor === c} aria-label={c} className="q-swatch" style={{ background: c }} onClick={() => update({ chairColor: c })} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "encima" && (
              <>
                <div className="q-field">
                  <h4 id="d-side" className="q-eyebrow">¿Dónde lo pones?</h4>
                  <div className="q-seg" role="radiogroup" aria-labelledby="d-side">
                    <button type="button" role="radio" aria-checked={side === "left"} className="q-seg__opt" onClick={() => setSide("left")}>
                      Izquierda · {labelOf(desk.left)}
                    </button>
                    <button type="button" role="radio" aria-checked={side === "right"} className="q-seg__opt" onClick={() => setSide("right")}>
                      Derecha · {labelOf(desk.right)}
                    </button>
                  </div>
                </div>
                <Chips items={DESK_CATEGORIES} value={cat} onChange={setCat} label="Categorías" />
                <ThumbGrid
                  options={surface}
                  value={sideValue}
                  onChange={(v) => update(side === "left" ? { left: v } : { right: v })}
                  paint={paintItemThumb}
                  label={side === "left" ? "Objeto del lado izquierdo" : "Objeto del lado derecho"}
                />
              </>
            )}

            {tab === "piso" && (
              <>
                <Chips items={FLOOR_CATEGORIES} value={floorCat} onChange={setFloorCat} label="Categorías" />
                <ThumbGrid options={floor} value={desk.floor} onChange={(v) => update({ floor: v })} paint={paintFloorThumb} label="Junto a la silla" />
              </>
            )}
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
