import React from "react";
import type {
  ChatEntry,
  NetStatus,
  RosterEntry,
} from "../game/useColyseus";

interface Props {
  status: NetStatus;
  roster: RosterEntry[];
  nearby: string[];
  messages: ChatEntry[];
  name: string;
  onName: (n: string) => void;
  sendChat: (text: string) => void;
}

const panel: React.CSSProperties = {
  background: "rgba(10,12,18,0.82)",
  color: "#e8ecf4",
  fontSize: 13,
  fontFamily: "system-ui",
  borderRadius: 8,
  padding: "8px 10px",
};

export function Sidebar({ status, roster, nearby, messages, name, onName, sendChat }: Props) {
  const [draft, setDraft] = React.useState("");
  const [nameDraft, setNameDraft] = React.useState(name);
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

  return (
    <aside
      style={{
        position: "absolute", top: 12, right: 12, width: 250, zIndex: 10,
        display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 24px)",
      }}
    >
      <div style={panel}>
        <div>
          server: <strong>{status}</strong> · {roster.length} en sala
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nameDraft.trim()) onName(nameDraft.trim());
          }}
          style={{ display: "flex", gap: 6, marginTop: 6 }}
        >
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            maxLength={24}
            placeholder="tu nombre"
            style={{ flex: 1, minWidth: 0, background: "#1a1f2b", color: "#fff", border: "1px solid #333c52", borderRadius: 6, padding: "4px 8px" }}
          />
          <button type="submit" style={{ cursor: "pointer" }}>OK</button>
        </form>
      </div>

      <div style={{ ...panel, maxHeight: 140, overflowY: "auto" }}>
        <strong>Jugadores</strong>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {roster.map((r) => (
            <li key={r.id}>
              {nearby.includes(r.id) ? "🟢 " : "⚪ "}
              {r.name}
              {r.self ? " (tú)" : ""}
            </li>
          ))}
          {roster.length === 0 && <li>—</li>}
        </ul>
      </div>

      <div style={{ ...panel, maxHeight: 110, overflowY: "auto" }}>
        <strong>Cerca de mí (mock proximidad)</strong>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {nearby.map((id) => {
            const r = roster.find((x) => x.id === id);
            return <li key={id}>{r ? r.name : id.slice(0, 4)}</li>;
          })}
          {nearby.length === 0 && <li style={{ opacity: 0.6 }}>nadie en rango…</li>}
        </ul>
      </div>

      <div style={{ ...panel, display: "flex", flexDirection: "column", minHeight: 120, maxHeight: 300 }}>
        <strong>Chat global</strong>
        <div style={{ overflowY: "auto", flex: 1, margin: "4px 0" }}>
          {messages.map((m, i) => (
            <div key={`${m.ts}-${i}`}>
              <strong>{m.name}:</strong> {m.text}
            </div>
          ))}
          {messages.length === 0 && <div style={{ opacity: 0.6 }}>sin mensajes…</div>}
          <div ref={chatEnd} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitChat();
          }}
          style={{ display: "flex", gap: 6 }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={280}
            placeholder="escribe y Enter"
            style={{ flex: 1, minWidth: 0, background: "#1a1f2b", color: "#fff", border: "1px solid #333c52", borderRadius: 6, padding: "4px 8px" }}
          />
          <button type="submit" style={{ cursor: "pointer" }}>➤</button>
        </form>
      </div>
    </aside>
  );
}
