import React from "react";
import type {
  ChatEntry,
  NetStatus,
  RosterEntry,
} from "../game/useColyseus";
import { AvatarCanvas } from "../avatar/AvatarCanvas";
import { randomAvatar, type AvatarConfig } from "../avatar/config";

interface Props {
  status: NetStatus;
  roster: RosterEntry[];
  nearby: string[];
  messages: ChatEntry[];
  name: string;
  /** The person's own avatar; others get a stable look from their name for now. */
  avatar: AvatarConfig;
  onEditProfile: () => void;
  /** Kept for API compatibility; renaming is not exposed in the UI yet. */
  onName: (n: string) => void;
  sendChat: (text: string) => void;
}

const STATUS_LABEL: Record<NetStatus, string> = {
  online: "En línea",
  connecting: "Conectando…",
  offline: "Sin conexión",
  demo: "Vista previa",
};

export function Sidebar({ status, roster, nearby, messages, name, avatar, onEditProfile, sendChat }: Props) {
  const [draft, setDraft] = React.useState("");
  const chatEnd = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const submitChat = () => {
    const t = draft.trim();
    if (!t) return;
    sendChat(t);
    setDraft("");
  };

  // Show self even before the server answers, so the list is never empty.
  const people: RosterEntry[] =
    roster.length > 0 ? roster : [{ id: "self", name, self: true }];
  const sorted = [...people].sort(
    (a, b) =>
      Number(b.self) - Number(a.self) ||
      Number(nearby.includes(b.id)) - Number(nearby.includes(a.id)),
  );

  return (
    <>
      <section className="q-panel" style={{ maxHeight: 260, overflowY: "auto" }}>
        <h3 className="q-eyebrow">
          <span>En la oficina · {roster.length || 1}</span>
          <span className="q-chip">
            <span className={`q-dot q-dot--${status}`} />
            {STATUS_LABEL[status]}
          </span>
        </h3>
        {sorted.map((r) => {
          const near = nearby.includes(r.id);
          const face = (
            <span className="q-avatar-mini" data-near={near}>
              <AvatarCanvas cfg={r.self ? avatar : randomAvatar(r.name)} scale={2} cropTop={3} cropRows={14} />
            </span>
          );
          if (r.self) {
            return (
              <button key={r.id} type="button" className="q-person q-person--self" onClick={onEditProfile}>
                {face}
                <span style={{ flex: 1, minWidth: 0 }}>
                  {r.name} <span className="q-muted">(tú)</span>
                </span>
                <span className="q-small q-muted">Editar ✎</span>
              </button>
            );
          }
          return (
            <div key={r.id} className="q-person">
              {face}
              <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
              {near && <span className="q-small" style={{ color: "var(--q-teal-dark)" }}>cerca</span>}
            </div>
          );
        })}
        {nearby.length === 0 && (
          <p className="q-small q-muted" style={{ margin: "8px 0 0" }}>
            Acércate a alguien en el mapa para hablar.
          </p>
        )}
      </section>

      <section className="q-panel q-chat">
        <h3 className="q-eyebrow">Chat general</h3>
        <div className="q-chat__log">
          {messages.map((m, i) => (
            <div key={`${m.ts}-${i}`} className="q-chat__msg">
              <strong>{m.name}</strong>
              {m.text}
            </div>
          ))}
          {messages.length === 0 && (
            <div className="q-muted q-small">Todavía no hay mensajes. Saluda al equipo 👋</div>
          )}
          <div ref={chatEnd} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitChat();
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            id="chat-input"
            className="q-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={280}
            placeholder="Escribe un mensaje"
            aria-label="Mensaje para el chat general"
          />
          <button type="submit" className="q-btn q-btn--primary q-btn--icon" aria-label="Enviar">
            ➤
          </button>
        </form>
      </section>
    </>
  );
}
