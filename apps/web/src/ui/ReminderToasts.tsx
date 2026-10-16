import type { ReminderToast } from "../game/useMeetingReminders";

function kindLabel(t: ReminderToast): string {
  if (t.kind === "now") return "Es ahora";
  if (t.kind === "m5") return "Empieza en 5 min";
  return "Empieza en 15 min";
}

/** Avisos de reunión: tarjeta con título, hora y enlace (no se autocierran). */
export function ReminderToasts({
  toasts,
  onDismiss,
}: {
  toasts: ReminderToast[];
  onDismiss: (key: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 300,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          role="alert"
          className="q-panel"
          style={{ padding: "10px 12px", borderLeft: "4px solid var(--q-orange)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong className="q-small">{kindLabel(t)}</strong>
            <button
              type="button"
              className="q-btn q-btn--ghost q-btn--sm"
              onClick={() => onDismiss(t.key)}
              aria-label={`Descartar aviso de ${t.title}`}
            >
              ✕
            </button>
          </div>
          <div className="q-small" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {t.title}
          </div>
          {t.when && <div className="q-small q-muted">{t.when}</div>}
          {t.url && (
            <a
              className="q-btn q-btn--primary q-btn--sm"
              style={{ marginTop: 6 }}
              href={t.url}
              target="_blank"
              rel="noreferrer"
            >
              {t.isMeet ? "Ir al Meet ↗" : "Ver en Calendar ↗"}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
