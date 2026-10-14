import React from "react";
import type { NetHandle } from "../game/useColyseus";
import {
  createMeeting,
  getEvents,
  getStatus,
  startOAuth,
  unlink,
  type CalendarEvent,
  type GoogleStatus,
} from "../api/google";

interface Props {
  net: NetHandle;
  /** Reporta los eventos del calendario para que la TV los ofrezca. */
  onEvents?: (events: CalendarEvent[]) => void;
  /** Admin local toggle: true = modo edición (arrastrar objetos), false = modo normal. */
  adminMode?: boolean;
  onAdminModeChange?: (enabled: boolean) => void;
}

export function GooglePanel({ net, onEvents, adminMode = false, onAdminModeChange }: Props) {
  const [status, setStatus] = React.useState<GoogleStatus | null>(null);
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState(30);
  const [published, setPublished] = React.useState("");

  const setBoth = React.useCallback(
    (ev: CalendarEvent[]) => {
      setEvents(ev);
      onEvents?.(ev);
    },
    [onEvents],
  );

  const refresh = React.useCallback(async () => {
    try {
      const s = await getStatus();
      setStatus(s);
      if (s.linked) setBoth(await getEvents());
      else setBoth([]);
    } catch {
      /* ignore */
    }
  }, [setBoth]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onLink = async () => {
    setBusy(true);
    const ok = await startOAuth();
    setBusy(false);
    if (ok) await refresh();
  };

  const onUnlink = async () => {
    await unlink();
    setBoth([]);
    setPublished("");
    await refresh();
  };

  const onCreate = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await createMeeting(title, minutes);
      setBoth(await getEvents());
      setPublished(r.meetUri);
      net.sendSetMeet(r.meetUri);
      setMsg(`Meet creado y publicado en TV Sala 1: ${r.meetUri}`);
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const onClearTv = () => {
    net.sendSetMeet("");
    setPublished("");
    setMsg("Meet en vivo limpiado de la TV.");
  };

  if (!status) return <div style={box}>Cargando…</div>;

  return (
    <div style={box}>
      <h3 style={{ margin: "0 0 8px" }}>Google</h3>
      {!status.configured && (
        <p style={{ color: "#c33", fontSize: 12 }}>
          OAuth no configurado en el server (.env GOOGLE_*).
        </p>
      )}
      {!status.linked ? (
        <button onClick={onLink} disabled={busy || !status.configured}>
          {busy ? "Abriendo…" : "Vincular Google"}
        </button>
      ) : (
        <>
          <p style={{ fontSize: 12 }}>
            Vinculado: {status.email}{" "}
            {status.role === "admin" && (
              <span style={{ color: "#f2c14a", fontWeight: 700 }}>[admin]</span>
            )}
          </p>
          {status.role === "admin" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={adminMode}
                onChange={(e) => onAdminModeChange?.(e.target.checked)}
              />
              Modo edición (arrastrar objetos)
            </label>
          )}
          <button onClick={onUnlink} style={{ fontSize: 12 }}>
            Desvincular
          </button>
          <h4 style={{ margin: "12px 0 4px" }}>Mi día</h4>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {events.length === 0 && <li>Sin eventos próximos</li>}
            {events.map((e) => (
              <li key={e.id}>
                {e.summary}{" "}
                {e.hangoutLink && (
                  <>
                    <a href={e.hangoutLink} target="_blank" rel="noreferrer">
                      Meet
                    </a>{" "}
                    <button
                      style={{ fontSize: 10, padding: "0 4px" }}
                      onClick={() => {
                        net.sendSetMeet(e.hangoutLink);
                        setMsg(`Publicado en TV Sala 1: ${e.hangoutLink}`);
                      }}
                    >
                      TV
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <h4 style={{ margin: "12px 0 4px" }}>Crear Meet</h4>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
              style={{ flex: 1, minWidth: 90 }}
            />
            <input
              type="number"
              value={minutes}
              min={5}
              max={480}
              onChange={(e) => setMinutes(Number(e.target.value))}
              style={{ width: 56 }}
            />
            <button onClick={onCreate} disabled={busy}>
              {busy ? "…" : "Crear + TV"}
            </button>
          </div>
          <button onClick={onClearTv} style={{ fontSize: 12, marginTop: 4 }}>
            Limpiar TV
          </button>
        </>
      )}
      {msg && (
        <p style={{ fontSize: 11, color: "#264", marginTop: 6 }}>{msg}</p>
      )}
      {published && (
        <p style={{ fontSize: 11, color: "#24a", marginTop: 4 }}>
          TV Sala 1 → {published}
        </p>
      )}
    </div>
  );
}

const box: React.CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  width: 240,
  background: "rgba(20,24,40,0.92)",
  color: "#eee",
  borderRadius: 10,
  padding: 12,
  zIndex: 30,
  fontFamily: "system-ui, sans-serif",
};
