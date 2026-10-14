import React from "react";
import { GameCanvas } from "./game/GameCanvas";
import { useColyseusRoom } from "./game/useColyseus";
import { useMeshVoice } from "./game/useMeshVoice";
import type { SmartObject } from "./game/objects";
import { Sidebar } from "./ui/Sidebar";
import { SmartObjectModal } from "./ui/SmartObjectModal";
import { VoicePanel } from "./ui/VoicePanel";
import { GooglePanel } from "./ui/GooglePanel";
import { AdminPanel } from "./ui/AdminPanel";
import type { CalendarEvent } from "./api/google";
import { getStatus, startOAuth, type GoogleStatus } from "./api/google";

function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pantalla de login: solo Google @quiiven.com. */
function LoginGate({ onAuthorized }: { onAuthorized: (s: GoogleStatus) => void }) {
  const [status, setStatus] = React.useState<GoogleStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [denied, setDenied] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const s = await getStatus();
    setStatus(s);
    if (s.authorized) onAuthorized(s);
    return s;
  }, [onAuthorized]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onLogin = async () => {
    setBusy(true);
    setDenied(false);
    const r = await startOAuth();
    setBusy(false);
    if (r.denied) {
      setDenied(true);
      return;
    }
    await refresh();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0e16",
        color: "#e8ecf4",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          textAlign: "center",
          background: "#141a28",
          padding: 32,
          borderRadius: 14,
          border: "1px solid #2a3346",
          maxWidth: 360,
        }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>gatherQuiiven</h1>
        <p style={{ color: "#9aa6bd", margin: "0 0 20px", fontSize: 13 }}>
          Oficina virtual. Acceso solo para @quiiven.com.
        </p>
        <button
          onClick={onLogin}
          disabled={busy || status?.configured === false}
          style={{
            background: "#1a73e8",
            color: "#fff",
            border: 0,
            padding: "12px 22px",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {busy ? "Abriendo…" : "Iniciar sesión con Google"}
        </button>
        {status?.configured === false && (
          <p style={{ color: "#c33", fontSize: 12, marginTop: 14 }}>
            OAuth no configurado en el server (.env GOOGLE_*).
          </p>
        )}
        {denied && (
          <p style={{ color: "#c33", fontSize: 12, marginTop: 14 }}>
            Acceso denegado: se requiere una cuenta @quiiven.com.
          </p>
        )}
      </div>
    </div>
  );
}

/** Juego una vez autenticado. */
function GameApp({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const [nearby, setNearby] = React.useState<string[]>([]);
  const [activeObject, setActiveObject] = React.useState<SmartObject | null>(null);
  const [calendarMeets, setCalendarMeets] = React.useState<CalendarEvent[]>([]);
  const [adminMode, setAdminMode] = React.useState(false);
  const { status, roster, messages, sendChat, net, meetUrl, objects } = useColyseusRoom(name);
  const voice = useMeshVoice(net);

  const onNearby = React.useCallback((ids: string[]) => setNearby(ids), []);
  const onObject = React.useCallback((obj: SmartObject | null) => setActiveObject(obj), []);
  const onPublishMeet = React.useCallback(
    (url: string) => net.sendSetMeet(url),
    [net],
  );

  React.useEffect(() => {
    voice.syncPeers(nearby);
  }, [nearby, voice]);

  const peerNames = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster) m.set(r.id, r.name);
    return m;
  }, [roster]);

  return (
    <div style={{ margin: 0 }}>
      <Sidebar
        status={status}
        roster={roster}
        nearby={nearby}
        messages={messages}
        name={name}
        onName={() => undefined}
        sendChat={sendChat}
      />
      <VoicePanel
        supported={voice.supported}
        active={voice.active}
        error={voice.error}
        localStream={voice.localStream}
        remoteStreams={voice.remoteStreams}
        mutedAudio={voice.mutedAudio}
        mutedVideo={voice.mutedVideo}
        peerNames={peerNames}
        onStart={() => void voice.start()}
        onStop={voice.stop}
        onToggleAudio={voice.toggleAudio}
        onToggleVideo={voice.toggleVideo}
      />
      <GooglePanel net={net} onEvents={setCalendarMeets} adminMode={adminMode} onAdminModeChange={setAdminMode} />
      {isAdmin && <AdminPanel net={net} objects={objects} />}
      <GameCanvas name={name} net={net} objects={objects} isAdmin={isAdmin} adminMode={adminMode} onNearby={onNearby} onObject={onObject} audio={voice.audio} />
      {activeObject && (
        <SmartObjectModal
          obj={activeObject}
          liveMeetUrl={meetUrl}
          calendarMeets={calendarMeets}
          onPublishMeet={onPublishMeet}
          onClose={() => setActiveObject(null)}
        />
      )}
    </div>
  );
}

export function App() {
  const [auth, setAuth] = React.useState<GoogleStatus | null>(null);

  if (!auth || !auth.authorized) {
    return <LoginGate onAuthorized={setAuth} />;
  }
  return <GameApp name={displayName(auth.email ?? "user")} isAdmin={auth.role === "admin"} />;
}
