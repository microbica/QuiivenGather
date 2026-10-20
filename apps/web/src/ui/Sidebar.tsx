import React from "react";
import type { BubbleKnock, ChatEntry, DmEntry, RosterEntry } from "../game/useColyseus";
import type { BubbleInfo } from "../game/GameCanvas";
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
  /** Private chats. */
  dms: DmEntry[];
  sendDm: (to: string, text: string) => void;
  onOpenChat: () => void;
  /** Unread private messages (for the folded-chat tab). */
  onUnreadChange?: (n: number) => void;
  /** Locked conversation ("burbuja") with the people around you. */
  bubble: BubbleInfo;
  bubbleKnocks: BubbleKnock[];
  onLockBubble: () => void;
  onLeaveBubble: () => void;
  onAdmitBubble: (k: BubbleKnock) => void;
  onDismissBubbleKnock: (k: BubbleKnock) => void;
}

const firstName = (n: string) => n.split(" ")[0];

export function Sidebar({
  roster,
  nearby,
  messages,
  sendChat,
  chatOpen,
  onCloseChat,
  dms,
  sendDm,
  onOpenChat,
  onUnreadChange,
  bubble,
  bubbleKnocks,
  onLockBubble,
  onLeaveBubble,
  onAdmitBubble,
  onDismissBubbleKnock,
}: Props) {
  const [draft, setDraft] = React.useState("");
  const chatEnd = React.useRef<HTMLDivElement>(null);
  /** "general" or the session id of the person you are chatting with. */
  const [active, setActive] = React.useState<string>("general");
  /** Conversations opened by hand (before any message). */
  const [opened, setOpened] = React.useState<{ id: string; name: string }[]>([]);
  /** Last time each conversation was looked at, for unread dots. */
  const [seen, setSeen] = React.useState<Record<string, number>>({});
  const [picking, setPicking] = React.useState(false);

  const convos = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const o of opened) m.set(o.id, o.name);
    for (const d of dms) m.set(d.peer, d.peerName);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [dms, opened]);
  const unread = (peer: string) => dms.filter((d) => d.peer === peer && !d.mine && d.ts > (seen[peer] ?? 0)).length;
  const totalUnread = convos.reduce((a, c) => a + (chatOpen && c.id === active ? 0 : unread(c.id)), 0);
  React.useEffect(() => onUnreadChange?.(totalUnread), [totalUnread, onUnreadChange]);

  // Reading a conversation marks it as seen.
  React.useEffect(() => {
    if (!chatOpen || active === "general") return;
    const last = dms.filter((d) => d.peer === active).at(-1)?.ts ?? 0;
    if (last > (seen[active] ?? 0)) setSeen((m) => ({ ...m, [active]: last }));
  }, [dms, active, chatOpen, seen]);

  const openDm = React.useCallback(
    (id: string, name: string) => {
      setOpened((list) => (list.some((o) => o.id === id) ? list : [...list, { id, name }]));
      setActive(id);
      setPicking(false);
      onOpenChat();
    },
    [onOpenChat],
  );

  const log = active === "general" ? null : dms.filter((d) => d.peer === active);
  const activeName = convos.find((c) => c.id === active)?.name ?? "";
  const online = roster.some((r) => r.id === active);

  React.useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, dms, active]);

  const submitChat = () => {
    const t = draft.trim();
    if (!t) return;
    if (active === "general") sendChat(t);
    else sendDm(active, t);
    setDraft("");
  };
  const others = roster.filter((r) => !r.self);

  // Solo gente a rango de voz (sin uno mismo). La tarjeta solo existe si hay alguien cerca.
  const nearPeople = nearby
    .map((id) => roster.find((r) => r.id === id))
    .filter((r): r is RosterEntry => !!r && !r.self);

  return (
    <>
      {(nearby.length > 0 || bubble.mine) && (
        <section className={`q-panel${bubble.mine ? " q-bubble-card" : ""}`} style={{ maxHeight: 300, overflowY: "auto" }}>
          <h3 className="q-eyebrow">
            {bubble.mine ? (
              <>
                <span>🔒 Conversación privada · {bubble.mine.members.length + 1}</span>
                <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={onLeaveBubble} title="Salir de la conversación privada">
                  Salir
                </button>
              </>
            ) : (
              <>
                <span>Cerca de ti · {nearby.length}</span>
                {bubble.canLock && (
                  <button
                    type="button"
                    className="q-btn q-btn--outline q-btn--sm"
                    onClick={onLockBubble}
                    title="Solo ustedes se escuchan; quien se acerque tendrá que pedir unirse"
                  >
                    🔒 Cerrar conversación
                  </button>
                )}
              </>
            )}
          </h3>
          {bubble.mine && (
            <p className="q-small q-muted" style={{ margin: "0 0 8px" }}>
              Solo ustedes se escuchan. Quien se acerque tiene que pedir unirse.
            </p>
          )}
          {bubbleKnocks.map((k) => (
            <div key={`${k.from}-${k.ts}`} className="q-bubble-knock" role="alert">
              <span>
                ✋ <strong>{k.name.split(" ")[0]}</strong> quiere unirse
              </span>
              <span style={{ display: "flex", gap: 4 }}>
                <button type="button" className="q-btn q-btn--primary q-btn--sm" onClick={() => onAdmitBubble(k)}>
                  Dejar entrar
                </button>
                <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => onDismissBubbleKnock(k)} aria-label="Ahora no">
                  ✕
                </button>
              </span>
            </div>
          ))}
          {nearPeople.map((r) => (
            <div key={r.id} className="q-person">
              <span className="q-avatar-mini" data-near={true}>
                <AvatarCanvas cfg={randomAvatar(r.name)} scale={2} cropTop={3} cropRows={14} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
              <button
                type="button"
                className="q-btn q-btn--ghost q-btn--sm"
                onClick={() => openDm(r.id, r.name)}
                aria-label={`Mensaje privado a ${r.name}`}
                title="Mensaje privado"
              >
                💬
              </button>
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
        <div className="q-chat__tabs" role="tablist" aria-label="Conversaciones">
          <button type="button" role="tab" aria-selected={active === "general"} className="q-chat__tab" onClick={() => setActive("general")}>
            General
          </button>
          {convos.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={active === c.id} className="q-chat__tab" onClick={() => setActive(c.id)}>
              🔒 {firstName(c.name)}
              {unread(c.id) > 0 && active !== c.id && <span className="q-chat__badge">{unread(c.id)}</span>}
            </button>
          ))}
          <button
            type="button"
            className="q-chat__tab q-chat__tab--new"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
            title="Nuevo mensaje privado"
            aria-label="Nuevo mensaje privado"
          >
            ＋
          </button>
          <button type="button" className="q-btn q-btn--ghost q-btn--sm" style={{ marginLeft: "auto" }} onClick={onCloseChat} aria-label="Cerrar chat" title="Plegar chat">
            ✕
          </button>
        </div>
        {picking && (
          <div className="q-chat__picker">
            <span className="q-small q-muted">Escribirle en privado a…</span>
            {others.map((r) => (
              <button key={r.id} type="button" className="q-person q-person--btn" onClick={() => openDm(r.id, r.name)}>
                <span className="q-avatar-mini">
                  <AvatarCanvas cfg={randomAvatar(r.name)} scale={2} cropTop={3} cropRows={14} />
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>{r.name}</span>
              </button>
            ))}
            {others.length === 0 && <span className="q-small q-muted">No hay nadie más conectado ahora.</span>}
          </div>
        )}
        <div className="q-chat__log">
          {log === null ? (
            <>
              {messages.map((m, i) => (
                <div key={`${m.ts}-${i}`} className="q-chat__msg">
                  <strong>{m.name}</strong>
                  {m.text}
                </div>
              ))}
              {messages.length === 0 && (
                <div className="q-muted q-small">Todavía no hay mensajes. Saluda al equipo 👋</div>
              )}
            </>
          ) : (
            <>
              <div className="q-small q-muted">🔒 Solo tú y {activeName} ven esta conversación.</div>
              {log.map((m, i) => (
                <div key={`${m.ts}-${i}`} className={`q-chat__bubble${m.mine ? " q-chat__bubble--mine" : ""}`}>
                  {m.text}
                </div>
              ))}
              {!online && <div className="q-small q-muted">{firstName(activeName)} ya no está conectado.</div>}
            </>
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
            placeholder={active === "general" ? "Escribe al equipo" : `Mensaje privado a ${firstName(activeName)}`}
            aria-label={active === "general" ? "Mensaje para el chat general" : `Mensaje privado a ${activeName}`}
            disabled={active !== "general" && !online}
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
