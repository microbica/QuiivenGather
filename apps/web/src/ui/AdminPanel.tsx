import React from "react";
import type { NetHandle } from "../game/useColyseus";
import type { Material, SmartObject } from "../game/objects";

interface Props {
  net: NetHandle;
  objects: SmartObject[];
  /** Edit mode: drag to move, click to rotate, right click to delete. */
  editing: boolean;
  onEditingChange: (on: boolean) => void;
}

type BuildKind = "wall" | "window" | "door";

const BUILD_KINDS: { kind: BuildKind; label: string; w: number; h: number }[] = [
  { kind: "wall", label: "Muro", w: 32, h: 32 },
  { kind: "window", label: "Ventana", w: 32, h: 32 },
  { kind: "door", label: "Puerta", w: 32, h: 48 },
];

const MATERIALS: { value: Material; label: string }[] = [
  { value: "wood", label: "Madera" },
  { value: "metal", label: "Metal" },
  { value: "glass", label: "Cristal" },
  { value: "stone", label: "Piedra" },
];

/**
 * Panel de administración del mapa (Fase 6). Solo visible para rol admin.
 * Permite duplicar, borrar, y construir muros/ventanas/puertas con material.
 * El movimiento es por arrastre directo en el canvas.
 */
export function AdminPanel({ net, objects, editing, onEditingChange }: Props) {
  const [open, setOpen] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [buildKind, setBuildKind] = React.useState<BuildKind>("wall");
  const [material, setMaterial] = React.useState<Material>("wood");
  const buildSpec = BUILD_KINDS.find((b) => b.kind === buildKind)!;

  const duplicate = (o: SmartObject) => {
    net.sendObjAdd(
      `${o.label} (copia)`,
      o.kind,
      o.x + 32,
      o.y + 32,
      o.w,
      o.h,
      o.radius,
      o.url,
      o.material,
    );
    setMsg(`Duplicado: ${o.label}`);
    setTimeout(() => setMsg(""), 2000);
  };

  const remove = (o: SmartObject) => {
    net.sendObjRemove(o.id);
    setMsg(`Eliminado: ${o.label}`);
    setTimeout(() => setMsg(""), 2000);
  };

  const buildHere = () => {
    // Centro del viewport: el cliente conoce su posición local;
    // para simplificar colocamos en el centro del mapa (100x60 tiles).
    // Snap a grid de 32px para que caiga en un cuadrito exacto.
    const TILE = 32;
    const cx = Math.round(1600 / TILE) * TILE; // 50 * TILE
    const cy = Math.round(960 / TILE) * TILE;  // 30 * TILE
    const x = cx - Math.round(buildSpec.w / TILE) * TILE / 2;
    const y = cy - Math.round(buildSpec.h / TILE) * TILE / 2;
    net.sendObjAdd(
      buildSpec.label,
      buildKind,
      x,
      y,
      buildSpec.w,
      buildSpec.h,
      0,
      "",
      material,
    );
    setMsg(`Construido: ${buildSpec.label} (${material}) en (${x}, ${y})`);
    setTimeout(() => setMsg(""), 2000);
  };

  const kindLabel: Record<string, string> = {
    meet: "TV",
    board: "Pizarra",
    generic: "Objeto",
    wall: "Muro",
    window: "Ventana",
    door: "Puerta",
  };
  const materialLabel = (m: Material) => MATERIALS.find((x) => x.value === m)?.label ?? m;

  return (
    <section className="q-panel q-admin" aria-label="Administración del mapa">
      <h3 className="q-eyebrow">
        <span>Admin · Mapa</span>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Ocultar" : "Mostrar"}
        </button>
      </h3>

      <label className="q-switch">
        <input id="admin-editing" type="checkbox" checked={editing} onChange={(e) => onEditingChange(e.target.checked)} />
        <span className="q-switch__track" aria-hidden="true" />
        <span>
          <strong>Modo edición</strong>
          <span className="q-small q-muted" style={{ display: "block" }}>
            Arrastra para mover · clic rota · clic derecho borra
          </span>
        </span>
      </label>

      {open && (
        <>
          <h4 id="admin-build" className="q-eyebrow" style={{ marginTop: 16 }}>Construir</h4>
          <div className="q-seg" role="radiogroup" aria-labelledby="admin-build" style={{ display: "flex" }}>
            {BUILD_KINDS.map((b) => (
              <button
                key={b.kind}
                type="button"
                role="radio"
                aria-checked={buildKind === b.kind}
                className="q-seg__opt"
                style={{ flex: 1 }}
                onClick={() => setBuildKind(b.kind)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="q-seg" role="radiogroup" aria-label="Material" style={{ display: "flex", marginTop: 6 }}>
            {MATERIALS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={material === m.value}
                className="q-seg__opt"
                style={{ flex: 1, padding: "7px 8px" }}
                onClick={() => setMaterial(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="q-btn q-btn--primary" style={{ width: "100%", marginTop: 10 }} onClick={buildHere}>
            Construir {buildSpec.label.toLowerCase()} de {materialLabel(material).toLowerCase()}
          </button>
          <p className="q-small q-muted" style={{ margin: "6px 0 0" }}>
            Aparece en el centro del mapa; luego arrástralo a su sitio.
          </p>

          <h4 className="q-eyebrow" style={{ marginTop: 16 }}>
            <span>En el mapa · {objects.length}</span>
          </h4>
          {objects.length === 0 && <p className="q-small q-muted">Todavía no hay objetos.</p>}
          <ul className="q-admin__list">
            {objects.map((o) => (
              <li key={o.id}>
                <span className="q-chip">{kindLabel[o.kind] ?? o.kind}</span>
                <span className="q-small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.label}
                  {(o.kind === "wall" || o.kind === "window" || o.kind === "door") && (
                    <span className="q-muted"> · {materialLabel(o.material)}</span>
                  )}
                </span>
                <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => duplicate(o)} aria-label={`Duplicar ${o.label}`} title="Duplicar">
                  ⧉
                </button>
                <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => remove(o)} aria-label={`Eliminar ${o.label}`} title="Eliminar" style={{ color: "var(--q-flame)" }}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && <p className="q-small" style={{ color: "var(--q-teal-dark)", margin: "8px 0 0" }}>{msg}</p>}
    </section>
  );
}
