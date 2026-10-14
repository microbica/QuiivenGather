import React from "react";
import type { NetHandle } from "../game/useColyseus";
import type { SmartObject } from "../game/objects";

interface Props {
  net: NetHandle;
  objects: SmartObject[];
}

/**
 * Panel de administración del mapa (Fase 6). Solo visible para rol admin.
 * Permite duplicar y borrar objetos inteligentes; el movimiento es por
 * arrastre directo en el canvas (pointer events en los marcadores).
 */
export function AdminPanel({ net, objects }: Props) {
  const [msg, setMsg] = React.useState("");

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
    );
    setMsg(`Duplicado: ${o.label}`);
    setTimeout(() => setMsg(""), 2000);
  };

  const remove = (o: SmartObject) => {
    net.sendObjRemove(o.id);
    setMsg(`Eliminado: ${o.label}`);
    setTimeout(() => setMsg(""), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        width: 260,
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
      {objects.length === 0 && <p>Sin objetos en el mapa.</p>}
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {objects.map((o) => (
          <li
            key={o.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {o.label}
            </span>
            <button
              onClick={() => duplicate(o)}
              style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
            >
              Duplicar
            </button>
            <button
              onClick={() => remove(o)}
              style={{
                fontSize: 11,
                padding: "2px 6px",
                cursor: "pointer",
                color: "#ff7777",
              }}
            >
              Borrar
            </button>
          </li>
        ))}
      </ul>
      {msg && <p style={{ color: "#264", fontSize: 11, margin: "6px 0 0" }}>{msg}</p>}
      <p style={{ color: "#789", fontSize: 10, margin: "8px 0 0" }}>
        Arrastra los marcadores ⌖ del mapa para moverlos.
      </p>
    </div>
  );
}
