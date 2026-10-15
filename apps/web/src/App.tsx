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
import { ProfilePanel } from "./ui/ProfilePanel";
import { loadAvatar, randomAvatar, saveAvatar, type AvatarConfig } from "./avatar/config";
import type { CalendarEvent } from "./api/google";
import { getStatus, startOAuth, type GoogleStatus } from "./api/google";

function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pantalla de login: solo Google @quiiven.com. */
function LoginGate({
  onAuthorized,
  onDemoLogin,
}: {
  onAuthorized: (s: GoogleStatus) => void;
  onDemoLogin?: () => void;
}) {
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
    if (!onDemoLogin) void refresh();
  }, [refresh, onDemoLogin]);

  const onLogin = async () => {
    if (onDemoLogin) return onDemoLogin();
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

  const asset = import.meta.env.BASE_URL;
  return (
    <main className="q-login">
      <section className="q-login__side">
        <img className="logo" src={`${asset}brand/logo-color.png`} alt="Quiiven" />
        <div className="q-login__copy">
          <h1>
            Nuestra oficina, <em>sin distancia.</em>
          </h1>
          <p>
            Entra con tu cuenta @quiiven.com, muévete por el mapa y acércate a tu
            equipo para hablar.
          </p>
          <button
            className="q-btn q-btn--primary"
            onClick={onLogin}
            disabled={busy || status?.configured === false}
          >
            {busy ? "Abriendo Google…" : "Entrar con Google"}
          </button>
          {status?.configured === false && (
            <p className="q-login__error">
              El inicio de sesión no está configurado en el servidor (.env GOOGLE_*).
            </p>
          )}
          {denied && (
            <p className="q-login__error">
              Esa cuenta no tiene acceso. Usa tu correo @quiiven.com.
            </p>
          )}
        </div>
        <span className="q-small q-muted">Quick · Quality — Oficina virtual Quiiven</span>
      </section>
      <figure className="q-login__art" aria-hidden="true">
        <img className="glass-1" src={`${asset}brand/vidrio-organic-ball.webp`} alt="" />
        <img className="glass-2" src={`${asset}brand/vidrio-round-cube.webp`} alt="" />
        <figcaption>Cerca, aunque estemos lejos.</figcaption>
      </figure>
    </main>
  );
}

/** Juego una vez autenticado. */
function GameApp({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const [nearby, setNearby] = React.useState<string[]>([]);
  const [activeObject, setActiveObject] = React.useState<SmartObject | null>(null);
  const [calendarMeets, setCalendarMeets] = React.useState<CalendarEvent[]>([]);
  const [adminMode, setAdminMode] = React.useState(false);
  // Saved avatar, or a starting suggestion seeded by the name on first visit.
  const [firstVisit] = React.useState(() => loadAvatar() === null);
  const [avatar, setAvatar] = React.useState<AvatarConfig>(() => loadAvatar() ?? randomAvatar(name));
  const [draftAvatar, setDraftAvatar] = React.useState<AvatarConfig | null>(null);
  const [profileOpen, setProfileOpen] = React.useState(firstVisit);
  const [profileIsNew, setProfileIsNew] = React.useState(firstVisit);
  const closeProfile = React.useCallback(() => {
    setDraftAvatar(null);
    setProfileOpen(false);
    setProfileIsNew(false);
  }, []);
  const saveProfile = React.useCallback((cfg: AvatarConfig) => {
    saveAvatar(cfg);
    setAvatar(cfg);
    setDraftAvatar(null);
    setProfileOpen(false);
    setProfileIsNew(false);
  }, []);
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
    <div style={{ position: "relative", height: "100%" }}>
      <aside className="q-rail">
        <GooglePanel net={net} onEvents={setCalendarMeets} />
        <Sidebar
        status={status}
        roster={roster}
        nearby={nearby}
        messages={messages}
        name={name}
        avatar={avatar}
        onEditProfile={() => setProfileOpen(true)}
        onName={() => undefined}
        sendChat={sendChat}
      />
      </aside>
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
      {isAdmin && <AdminPanel net={net} objects={objects} editing={adminMode} onEditingChange={setAdminMode} />}
      <GameCanvas name={name} avatar={draftAvatar ?? avatar} net={net} objects={objects} isAdmin={isAdmin} adminMode={adminMode} onNearby={onNearby} onObject={onObject} audio={voice.audio} />
      {profileOpen && (
        <ProfilePanel
          name={name}
          value={avatar}
          firstTime={profileIsNew}
          onPreview={setDraftAvatar}
          onSave={saveProfile}
          onClose={closeProfile}
        />
      )}
      {activeObject && !profileOpen && (
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

/** Design-preview mode: skips Google login so the UI can be reviewed without a server. */
const DEMO = import.meta.env.VITE_DEMO === "1";

export function App() {
  const [auth, setAuth] = React.useState<GoogleStatus | null>(null);

  const [demoIn, setDemoIn] = React.useState(false);

  if (DEMO) {
    return demoIn ? (
      <GameApp name="Invitado Demo" isAdmin />
    ) : (
      <LoginGate onAuthorized={() => undefined} onDemoLogin={() => setDemoIn(true)} />
    );
  }

  if (!auth || !auth.authorized) {
    return <LoginGate onAuthorized={setAuth} />;
  }
  return <GameApp name={displayName(auth.email ?? "user")} isAdmin={auth.role === "admin"} />;
}
