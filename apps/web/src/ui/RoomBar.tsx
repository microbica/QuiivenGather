import React from "react";
import type { Zone } from "../game/mapLoader";
import type { KnockEntry } from "../game/useColyseus";

interface Props {
  zone: Zone;
  people: number;
  /** Name of who closed the room, or undefined when it is open. */
  lockedBy?: string;
  meetUrl?: string;
  voiceActive: boolean;
  knocks: KnockEntry[];
  onStartVoice: () => void;
  onLock: (locked: boolean) => void;
  onSetMeet: (url: string) => void;
  onAdmit: (k: KnockEntry) => void;
  onDismissKnock: (k: KnockEntry) => void;
}

const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z0-9-]+(\?.*)?$/i;

/** Meeting-room bar: shown while you are inside a meeting room. */
export function RoomBar({ zone, people, lockedBy, meetUrl, voiceActive, knocks, onStartVoice, onLock, onSetMeet, onAdmit, onDismissKnock }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const valid = MEET_RE.test(draft.trim());
  const locked = lockedBy !== undefined;

  return (
    <div className="q-roombar" role="region" aria-label={`Sala ${zone.label}`}>
      <div className="q-panel q-roombar__main">
        <div className="q-roombar__title">
          <span className={`q-area-dot q-area-dot--${zone.area ?? "general"}`} aria-hidden="true" />
          <strong>{zone.label}</strong>
          <span className="q-small q-muted">
            {people} {people === 1 ? "persona" : "personas"}
            {locked && ` · cerrada por ${lockedBy}`}
          </span>
        </div>
        <div className="q-roombar__actions">
          {voiceActive ? (
            <span className="q-chip">
              <span className="q-dot q-dot--online" /> En la llamada de la sala
            </span>
          ) : (
            <button type="button" className="q-btn q-btn--primary q-btn--sm" onClick={onStartVoice}>
              🎙 Unirme a la llamada
            </button>
          )}
          {meetUrl ? (
            <a className="q-btn q-btn--outline q-btn--sm" href={meetUrl} target="_blank" rel="noopener noreferrer">
              🎥 Abrir Meet
            </a>
          ) : (
            <button type="button" className="q-btn q-btn--outline q-btn--sm" onClick={() => setEditing((v) => !v)}>
              🎥 Vincular Meet
            </button>
          )}
          <button
            type="button"
            className={`q-btn q-btn--sm ${locked ? "q-btn--dark" : "q-btn--outline"}`}
            aria-pressed={locked}
            onClick={() => onLock(!locked)}
            title={locked ? "Abrir la sala para que cualquiera pueda entrar" : "Reunión privada: nadie más puede entrar (pueden tocar la puerta)"}
          >
            {locked ? "🔒 Cerrada" : "🔓 Cerrar sala"}
          </button>
          {meetUrl && (
            <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => setEditing((v) => !v)} aria-label="Cambiar Meet de la sala" title="Cambiar Meet de la sala">
              ✎
            </button>
          )}
        </div>
        {editing && (
          <form
            className="q-roombar__meet"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              onSetMeet(draft.trim());
              setDraft("");
              setEditing(false);
            }}
          >
            <input
              className="q-input"
              autoFocus
              placeholder="https://meet.google.com/abc-defg-hij"
              aria-label="Enlace de Google Meet de la sala"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="q-btn q-btn--primary q-btn--sm" disabled={!valid}>
              Guardar
            </button>
            {meetUrl && (
              <button
                type="button"
                className="q-btn q-btn--ghost q-btn--sm"
                onClick={() => {
                  onSetMeet("");
                  setEditing(false);
                }}
              >
                Quitar
              </button>
            )}
          </form>
        )}
      </div>
      {knocks.map((k) => (
        <div key={`${k.from}-${k.ts}`} className="q-panel q-roombar__knock" role="alert">
          <span>
            ✊ <strong>{k.name}</strong> está tocando la puerta
          </span>
          <button type="button" className="q-btn q-btn--primary q-btn--sm" onClick={() => onAdmit(k)}>
            Dejar pasar
          </button>
          <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => onDismissKnock(k)}>
            Ahora no
          </button>
        </div>
      ))}
    </div>
  );
}
