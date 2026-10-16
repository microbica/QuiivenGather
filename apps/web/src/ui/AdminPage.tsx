import React from "react";
import { useColyseusRoom } from "../game/useColyseus";
import { GooglePanel } from "./GooglePanel";
import { UsersAdmin } from "./UsersAdmin";
import { listPlayers, type AdminPlayerRow } from "../api/admin";

function fmtDate(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * Página de administración (#/admin): gestión de cuentas, objetos, reuniones
 * y estado guardado. Se conecta al room en modo oculto (sin avatar) para
 * operar en vivo con la sesión del admin.
 */
export function AdminPage({
  name,
  myEmail,
  onBack,
}: {
  name: string;
  myEmail: string;
  onBack: () => void;
}) {
  const { status, net, meetUrl } = useColyseusRoom(name, { hidden: true });
  const [players, setPlayers] = React.useState<AdminPlayerRow[]>([]);
  const [playersErr, setPlayersErr] = React.useState("");
  const [playersBusy, setPlayersBusy] = React.useState(false);

  const refreshPlayers = React.useCallback(async () => {
    setPlayersBusy(true);
    setPlayersErr("");
    try {
      setPlayers(await listPlayers());
    } catch (e) {
      setPlayersErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPlayersBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshPlayers();
  }, [refreshPlayers]);

  return (
    <main className="q-admin-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 64px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={onBack}>
          ← Juego
        </button>
        <h1 style={{ margin: 0, fontSize: 22 }}>Administración</h1>
        <span className="q-chip" title="Conexión al room (oculta, sin avatar)">
          {status === "online" ? "● en vivo" : status === "offline" ? "○ sin conexión" : "… conectando"}
        </span>
      </header>

      <p className="q-small q-muted" style={{ margin: "0 0 16px" }}>
        Los objetos del mapa se gestionan en el juego (modo edición: arrastrar, clic para rotar, clic derecho para borrar).
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <UsersAdmin myEmail={myEmail} />
        <section className="q-panel" aria-label="TV en vivo">
          <h3 className="q-eyebrow">
            <span>TV Sala 1</span>
          </h3>
          {meetUrl ? (
            <>
              <p className="q-small" style={{ wordBreak: "break-all" }}>
                En vivo:{" "}
                <a href={meetUrl} target="_blank" rel="noreferrer">
                  {meetUrl}
                </a>
              </p>
              <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => net.sendSetMeet("")}>
                Limpiar TV
              </button>
            </>
          ) : (
            <p className="q-small q-muted" style={{ margin: 0 }}>
              Sin reunión publicada. Publícala desde “Mi día” o entrando una URL de Meet.
            </p>
          )}
        </section>
        <GooglePanel net={net} />
        <section className="q-panel" aria-label="Estado guardado de jugadores">
          <h3 className="q-eyebrow">
            <span>Jugadores guardados · {players.length}</span>
            <button
              type="button"
              className="q-btn q-btn--ghost q-btn--sm"
              onClick={() => void refreshPlayers()}
              disabled={playersBusy}
            >
              {playersBusy ? "…" : "Recargar"}
            </button>
          </h3>
          <p className="q-small q-muted" style={{ margin: "0 0 8px" }}>
            Posición y avatar persistidos (tabla <code>players</code>). Solo lectura.
          </p>
          {playersErr && <p className="q-small" style={{ color: "var(--q-flame)" }}>{playersErr}</p>}
          {players.length === 0 && !playersErr && !playersBusy && (
            <p className="q-small q-muted">Nadie ha entrado todavía.</p>
          )}
          <ul className="q-admin__list">
            {players.map((p) => (
              <li key={p.email}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    flex: "none",
                    background: `#${p.color.toString(16).padStart(6, "0")}`,
                  }}
                />
                <span className="q-small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.email}
                  <span className="q-muted">
                    {" "}
                    · ({Math.round(p.x)},{Math.round(p.y)}) {p.dir}/{p.anim} {p.zoneId || "—"}
                  </span>
                </span>
                <span className="q-small q-muted" title={fmtDate(p.updatedAt)}>
                  {fmtDate(p.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
