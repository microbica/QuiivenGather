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
      setMsg("Reunión creada y publicada en la TV de Sala 1.");
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const onClearTv = () => {
    net.sendSetMeet("");
    setPublished("");
    setMsg("La TV quedó libre.");
  };

  if (!status) {
    return (
      <section className="q-panel">
        <h3 className="q-eyebrow">Mi día</h3>
        <span className="q-small q-muted">Cargando tu calendario…</span>
      </section>
    );
  }

  return (
    <section className="q-panel" style={{ maxHeight: 320, overflowY: "auto" }}>
      <h3 className="q-eyebrow">
        <span>Mi día</span>
        {status.linked && (
          <button className="q-btn q-btn--ghost q-btn--sm" onClick={onUnlink}>
            Desvincular
          </button>
        )}
      </h3>
      {!status.configured && (
        <p className="q-small" style={{ color: "var(--q-orange)", margin: "0 0 8px" }}>
          Google no está configurado en el servidor (.env GOOGLE_*).
        </p>
      )}
      {!status.linked ? (
        <>
          <p className="q-small q-muted" style={{ margin: "0 0 10px" }}>
            Conecta tu Google para ver tus reuniones y llevarlas a la TV de la sala.
          </p>
          <button className="q-btn q-btn--sm" onClick={onLink} disabled={busy || !status.configured}>
            {busy ? "Abriendo…" : "Conectar Google Calendar"}
          </button>
        </>
      ) : (
        <>
          <p className="q-small q-muted" style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
            {status.email}
            {status.role === "admin" && <span className="q-chip">Admin</span>}
          </p>
          {status.role === "admin" && (
            <label className="q-small" style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px", cursor: "pointer" }}>
              <input
                id="admin-mode"
                type="checkbox"
                checked={adminMode}
                onChange={(e) => onAdminModeChange?.(e.target.checked)}
                style={{ accentColor: "var(--q-carbon)" }}
              />
              Modo edición (arrastrar objetos)
            </label>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {events.length === 0 && <span className="q-small q-muted">Sin reuniones próximas.</span>}
            {events.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="q-small" style={{ flex: 1, minWidth: 0 }}>{e.summary}</span>
                {e.hangoutLink && (
                  <>
                    <a className="q-btn q-btn--ghost q-btn--sm" href={e.hangoutLink} target="_blank" rel="noreferrer">
                      Meet ↗
                    </a>
                    <button
                      className="q-btn q-btn--sm"
                      onClick={() => {
                        net.sendSetMeet(e.hangoutLink);
                        setMsg(`Publicado en la TV de Sala 1.`);
                      }}
                    >
                      A la TV
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <h4 className="q-eyebrow" style={{ marginTop: 14 }}>Nueva reunión</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              id="meet-title"
              className="q-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
              aria-label="Título de la reunión"
            />
            <input
              id="meet-minutes"
              className="q-input"
              type="number"
              value={minutes}
              min={5}
              max={480}
              onChange={(e) => setMinutes(Number(e.target.value))}
              aria-label="Duración en minutos"
              style={{ flex: "none", width: 64 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="q-btn q-btn--primary q-btn--sm" onClick={onCreate} disabled={busy}>
              {busy ? "Creando…" : "Crear y llevar a la TV"}
            </button>
            <button className="q-btn q-btn--ghost q-btn--sm" onClick={onClearTv}>
              Limpiar TV
            </button>
          </div>
        </>
      )}
      {msg && <p className="q-small" style={{ color: "var(--q-teal)", margin: "8px 0 0" }}>{msg}</p>}
      {published && (
        <p className="q-small q-muted" style={{ margin: "4px 0 0", wordBreak: "break-all" }}>
          TV Sala 1 → {published}
        </p>
      )}
    </section>
  );
}
