import React from "react";
import type { ChatEntry, RosterEntry } from "../game/useColyseus";
import { AvatarCanvas } from "../avatar/AvatarCanvas";
import { randomAvatar } from "../avatar/config";

interface Props {
  roster: RosterEntry[];
  nearby: string[];
  messages: ChatEntry[];
  sendChat: (text: string) => void;
  /** El chat se pliega con la flecha del header; se abre desde la pestaña del borde. */
  chatOpen: boolean;
  onCloseChat: () => void;
}

export function Sidebar({ roster, nearby, messages, sendChat, chatOpen, onCloseChat }: Props) {
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

  // Solo gente a rango de voz (sin uno mismo). La tarjeta solo existe si hay alguien cerca.
  const nearPeople = nearby
    .map((id) => roster.find((r) => r.id === id))
    .filter((r): r is RosterEntry => !!r && !r.self);

  return (
    <>
      {nearby.length > 0 && (
        <section className="q-panel" style={{ maxHeight: 260, overflowY: "auto" }}>
          <h3 className="q-eyebrow">
            <span>Cerca de ti · {nearby.length}</span>
          </h3>
          {nearPeople.map((r) => (
            <div key={r.id} className="q-person">
              <span className="q-avatar-mini" data-near={true}>
                <AvatarCanvas cfg={randomAvatar(r.name)} scale={2} cropTop={3} cropRows={14} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
              <span className="q-small" style={{ color: "var(--q-teal-dark)" }}>cerca</span>
            </div>
          ))}
          {nearPeople.length === 0 && (
            <p className="q-small q-muted" style={{ margin: "8px 0 0" }}>
              Alguien se acerca…
            </p>
          )}
        </section>
      )}
      {chatOpen && (
      <section className="q-panel q-chat" style={{ maxHeight: "50%", marginTop: "auto" }}>
        <h3 className="q-eyebrow">
          <span>Chat general</span>
          <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={onCloseChat} aria-label="Cerrar chat" title="Plegar chat">
            ✕
          </button>
        </h3>
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
      )}
    </>
  );
}
