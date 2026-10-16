import React from "react";
import {
  createMeeting,
  getStatus,
  startOAuth,
  type CalendarEvent,
  type GoogleStatus,
} from "../api/google";
import { formatAgo, formatRange, isLive } from "../calendar/eventTime";
import type { NotifyPermission } from "../game/useMeetingReminders";

interface Props {
  /** Eventos vigentes (los provee el padre, con panel abierto o no). */
  events: CalendarEvent[];
  /** Reloj del padre (para "En curso" y "hace X"). */
  now: number;
  /** Estado del fetch (dueño: el padre) para anti-spam y feedback. */
  syncing: boolean;
  lastSyncAt: number | null;
  /** Permiso de Notification nativa + cómo pedirlo. */
  notifyPermission: NotifyPermission;
  onEnableNotifications: () => void;
  /** Refresca los eventos tras crear/desvincular. */
  onChanged: () => void;
}

/** Clics dentro de esta ventana no re-consultan: ya está sincronizado. */
const SYNC_COOLDOWN_MS = 60_000;

export function GooglePanel({ events, now, syncing, lastSyncAt, notifyPermission, onEnableNotifications, onChanged }: Props) {
  const [status, setStatus] = React.useState<GoogleStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState(30);
  const [published, setPublished] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState("");

  const refreshStatus = React.useCallback(async () => {
    try {
      setStatus(await getStatus());
    } catch {
      // Server unreachable (or design preview): show the "connect" state instead of loading forever.
      setStatus({ linked: false, configured: false, authorized: false, role: "user" });
    }
  }, []);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onLink = async () => {
    setBusy(true);
    const ok = await startOAuth();
    setBusy(false);
    if (ok) {
      await refreshStatus();
      onChanged();
    }
  };

  /** Re-consulta el calendario con anti-spam (60 s) y feedback. */
  const onRefresh = async () => {
    if (syncing) return;
    if (lastSyncAt && Date.now() - lastSyncAt < SYNC_COOLDOWN_MS) {
      setSyncMsg("Ya está sincronizado.");
      return;
    }
    setSyncMsg("");
    await onChanged();
  };

  const onCreate = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await createMeeting(title, minutes);
      onChanged();
      setPublished(r.meetUri);
      setMsg("Reunión creada.");
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <section className="q-panel">
        <h3 className="q-eyebrow">Mi día</h3>
        <span className="q-small q-muted">Cargando tu calendario…</span>
      </section>
    );
  }

  const syncLine = syncMsg !== ""
    ? syncMsg
    : syncing
      ? "Sincronizando…"
      : lastSyncAt
        ? `Sincronizado ${formatAgo(lastSyncAt, now)}`
        : "";

  return (
    <section className="q-panel" style={{ maxHeight: 320, overflowY: "auto" }}>
      <h3 className="q-eyebrow">
        <span>Mi día</span>
        {status.linked && (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <button
              type="button"
              className="q-btn q-btn--ghost q-btn--sm"
              onClick={() => void onRefresh()}
              disabled={syncing}
              aria-label="Actualizar calendario"
              title="Actualizar calendario"
              style={{ fontSize: 14, lineHeight: 1, padding: "2px 10px" }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  transform: syncing ? "rotate(360deg)" : "none",
                  transition: syncing ? "transform 0.9s ease" : "none",
                }}
              >
                ⟳
              </span>
            </button>
            <button
              type="button"
              className="q-btn q-btn--ghost q-btn--sm"
              onClick={() => setShowCreate((v) => !v)}
              aria-label={showCreate ? "Cerrar creación de reunión" : "Crear reunión"}
              title={showCreate ? "Cerrar" : "Crear reunión"}
              aria-expanded={showCreate}
              style={{ fontSize: 16, lineHeight: 1, padding: "2px 10px" }}
            >
              {showCreate ? "✕" : "+"}
            </button>
            {notifyPermission !== "unsupported" && (
              <button
                type="button"
                className="q-btn q-btn--ghost q-btn--sm"
                onClick={() => {
                  if (notifyPermission === "default") onEnableNotifications();
                }}
                disabled={notifyPermission !== "default"}
                aria-label={
                  notifyPermission === "granted"
                    ? "Avisos del navegador activos"
                    : notifyPermission === "denied"
                      ? "Avisos del navegador bloqueados"
                      : "Activar avisos del navegador (15 y 5 min antes, y al empezar)"
                }
                title={
                  notifyPermission === "granted"
                    ? "Avisos del navegador activos"
                    : notifyPermission === "denied"
                      ? "Avisos del navegador bloqueados"
                      : "Activar avisos del navegador"
                }
                style={{
                  padding: "2px 10px",
                  color: notifyPermission === "granted" ? "var(--q-teal)" : undefined,
                  opacity: notifyPermission === "denied" ? 0.4 : 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={notifyPermission === "granted" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
            )}
          </span>
        )}
      </h3>
      {!status.linked && !status.configured && (
        <p className="q-small" style={{ color: "var(--q-orange)", margin: "0 0 8px" }}>
          Google no está configurado en el servidor (.env GOOGLE_*).
        </p>
      )}
      {!status.linked ? (
        <>
          <p className="q-small q-muted" style={{ margin: "0 0 10px" }}>
            Conecta tu Google para ver tus reuniones e ir al Meet.
          </p>
          <button className="q-btn q-btn--sm" onClick={onLink} disabled={busy || !status.configured}>
            {busy ? "Abriendo…" : "Conectar Google Calendar"}
          </button>
        </>
      ) : (
        <>
          {syncLine !== "" && (
            <p className="q-small q-muted" style={{ margin: "0 0 4px" }}>{syncLine}</p>
          )}
          <p className="q-small q-muted" style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
            {status.email}
            {status.role === "admin" && <span className="q-chip">Admin</span>}
          </p>
          {showCreate && (
            <div style={{ padding: "10px 2px", borderTop: "1px solid var(--q-line)" }}>
              <h4 className="q-eyebrow">Nueva reunión</h4>
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
                  {busy ? "Creando…" : "Crear reunión"}
                </button>
              </div>
              {msg && <p className="q-small" style={{ color: "var(--q-teal)", margin: "8px 0 0" }}>{msg}</p>}
              {published && (
                <p className="q-small" style={{ margin: "8px 0 0" }}>
                  <a className="q-btn q-btn--primary q-btn--sm" href={published} target="_blank" rel="noreferrer">
                    Ir al Meet de la reunión creada ↗
                  </a>
                </p>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {events.length === 0 && <span className="q-small q-muted">Sin reuniones próximas.</span>}
            {events.map((e) => (
              <article
                key={e.id}
                style={{
                  display: "flex",
                  gap: 10,
                  minWidth: 0,
                  padding: "10px 2px",
                  borderTop: "1px solid var(--q-line)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    width: 4,
                    borderRadius: 999,
                    background: e.hangoutLink ? "var(--q-teal)" : "var(--q-line)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                  <span
                    className="q-small"
                    style={{ fontWeight: 600, fontSize: 13, overflowWrap: "anywhere" }}
                  >
                    {e.summary || "(Sin título)"}
                  </span>
                  {formatRange(e) && (
                    <span className="q-small q-muted" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {formatRange(e)}
                      {isLive(e, now) && (
                        <span
                          className="q-chip"
                          style={{ background: "var(--q-teal)", color: "#fff", fontSize: 10, padding: "2px 8px" }}
                        >
                          En curso
                        </span>
                      )}
                    </span>
                  )}
                  <span style={{ marginTop: 3 }}>
                    {e.hangoutLink ? (
                      <a className="q-btn q-btn--primary q-btn--sm" href={e.hangoutLink} target="_blank" rel="noreferrer">
                        Ir al Meet ↗
                      </a>
                    ) : (
                      <a className="q-btn q-btn--sm" href={e.htmlLink} target="_blank" rel="noreferrer">
                        Ver en Calendar ↗
                      </a>
                    )}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
