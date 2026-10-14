import React from "react";
import type { NetHandle } from "../game/useColyseus";
import type { Material, SmartObject } from "../game/objects";

interface Props {
  net: NetHandle;
  objects: SmartObject[];
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
export function AdminPanel({ net, objects }: Props) {
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
    // para simplificar colocamos en (640, 480) que es el centro del mapa 40x30 @32.
    const x = 640 - buildSpec.w / 2;
    const y = 480 - buildSpec.h / 2;
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

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        width: 280,
        maxHeight: "60vh",
        overflowY: "auto",
        background: "rgba(20,24,40,0.94)",
        color: "#eee",
        borderRadius: 10,
        padding: 10,
        zIndex: 30,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <h4 style={{ margin: "0 0 8px", color: "#f2c14a" }}>Admin · Objetos</h4>

      <h5 style={{ margin: "8px 0 4px", color: "#9cc8ff" }}>Construir</h5>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {BUILD_KINDS.map((b) => (
          <button
            key={b.kind}
            onClick={() => setBuildKind(b.kind)}
            style={{
              flex: 1,
              fontSize: 11,
              padding: "4px 6px",
              cursor: "pointer",
              background: buildKind === b.kind ? "#1a73e8" : "#2a3040",
              color: "#fff",
              border: 0,
              borderRadius: 4,
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {MATERIALS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMaterial(m.value)}
            style={{
              flex: 1,
              fontSize: 11,
              padding: "4px 6px",
              cursor: "pointer",
              background: material === m.value ? "#51d88a" : "#2a3040",
              color: "#fff",
              border: 0,
              borderRadius: 4,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <button
        onClick={buildHere}
        style={{
          width: "100%",
          fontSize: 12,
          padding: "6px 8px",
          cursor: "pointer",
          background: "#f2c14a",
          color: "#1a1f2e",
          border: 0,
          borderRadius: 4,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Construir {buildSpec.label} {material} aquí
      </button>

      <h5 style={{ margin: "8px 0 4px", color: "#9cc8ff" }}>Existentes</h5>
      {objects.length === 0 && <p>Sin objetos en el mapa.</p>}
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {objects.map((o) => (
          <li
            key={o.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {o.label}{" "}
              {o.kind === "wall" || o.kind === "window" || o.kind === "door" ? (
                <span style={{ color: "#789" }}>({o.material})</span>
              ) : null}
            </span>
            <button
              onClick={() => duplicate(o)}
              style={{ fontSize: 10, padding: "1px 5px", cursor: "pointer" }}
            >
              Dup
            </button>
            <button
              onClick={() => remove(o)}
              style={{
                fontSize: 10,
                padding: "1px 5px",
                cursor: "pointer",
                color: "#ff7777",
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {msg && <p style={{ color: "#9cc8ff", fontSize: 11, margin: "6px 0 0" }}>{msg}</p>}
      <p style={{ color: "#789", fontSize: 10, margin: "8px 0 0" }}>
        Arrastra los sprites del mapa para moverlos.
      </p>
    </div>
  );
}
