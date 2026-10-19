import React from "react";
import { isMeetingRoom } from "@quiiven/protocol";
import type { Zone } from "../game/mapLoader";

interface Props {
  zones: Zone[];
  /** People per zone id (you included). */
  occupancy: Record<string, number>;
  locks: Record<string, string>;
  roomMeets: Record<string, string>;
  currentZoneId: string;
  onGo: (zone: Zone) => void;
  onKnock: (zone: Zone) => void;
}

type Group = { id: string; title: string; rooms: Zone[] };

function groupRooms(zones: Zone[]): Group[] {
  const rooms = zones.filter((z) => z.kind !== "spawn");
  const meeting = rooms.filter((z) => isMeetingRoom(z.id));
  const common = rooms.filter((z) => !isMeetingRoom(z.id) && (z.area === "general" || z.kind === "interact"));
  const teams = rooms.filter((z) => !meeting.includes(z) && !common.includes(z));
  return [
    { id: "meeting", title: "Salas de reunión", rooms: meeting },
    { id: "teams", title: "Equipos", rooms: teams },
    { id: "common", title: "Espacios comunes", rooms: common },
  ];
}

/** "Salas": list of rooms; one click walks your avatar there by itself. */
export function RoomsPanel({ zones, occupancy, locks, roomMeets, currentZoneId, onGo, onKnock }: Props) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const groups = React.useMemo(() => groupRooms(zones), [zones]);
  const query = q.trim().toLowerCase();
  const total = Object.values(occupancy).reduce((a, b) => a + b, 0);

  return (
    <div className="q-rooms">
      <button
        type="button"
        className="q-panel q-rooms__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 14V2.5h7.5V14M10.5 4.5H13V14M1.5 14h13" />
          <circle cx="8.3" cy="8.5" r=".6" fill="currentColor" />
        </svg>
        Salas
        <span className="q-rooms__count">{total}</span>
        <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <section className="q-panel q-rooms__panel" aria-label="Salas de la oficina">
          <input
            className="q-input"
            placeholder="Buscar sala o equipo"
            aria-label="Buscar sala"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="q-rooms__list">
            {groups.map((g) => {
              const rooms = g.rooms.filter((z) => !query || z.label.toLowerCase().includes(query));
              if (!rooms.length) return null;
              return (
                <div key={g.id}>
                  <h4 className="q-eyebrow">{g.title}</h4>
                  {rooms.map((z) => {
                    const n = occupancy[z.id] ?? 0;
                    const lockedBy = locks[z.id];
                    const here = z.id === currentZoneId;
                    const closed = lockedBy !== undefined && !here;
                    return (
                      <div key={z.id} className={`q-room${here ? " q-room--here" : ""}`}>
                        <button
                          type="button"
                          className="q-room__go"
                          disabled={here || closed}
                          onClick={() => onGo(z)}
                          title={here ? "Estás aquí" : closed ? `Cerrada por ${lockedBy}` : `Ir a ${z.label}`}
                        >
                          <span className={`q-area-dot q-area-dot--${z.area ?? "general"}`} aria-hidden="true" />
                          <span className="q-room__name">{z.label}</span>
                          {roomMeets[z.id] && <span title="Tiene Meet">🎥</span>}
                          {lockedBy !== undefined && <span title={`Cerrada por ${lockedBy}`}>🔒</span>}
                          {n > 0 && (
                            <span className="q-room__people" aria-label={`${n} personas`}>
                              {n}
                            </span>
                          )}
                          {here && <span className="q-small q-muted">aquí</span>}
                        </button>
                        {closed && (
                          <button type="button" className="q-btn q-btn--outline q-btn--sm" onClick={() => onKnock(z)}>
                            Tocar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
