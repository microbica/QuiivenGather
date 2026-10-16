import React from "react";
import { GameCanvas } from "./game/GameCanvas";
import { useCalendarEvents } from "./game/useCalendarEvents";
import { useColyseusRoom } from "./game/useColyseus";
import { useMeetingReminders } from "./game/useMeetingReminders";
import { useMeshVoice } from "./game/useMeshVoice";
import type { SmartObject } from "./game/objects";
import { Sidebar } from "./ui/Sidebar";
import { SmartObjectModal } from "./ui/SmartObjectModal";
import { VoicePanel } from "./ui/VoicePanel";
import { GooglePanel } from "./ui/GooglePanel";
import { AdminPanel } from "./ui/AdminPanel";
import { AdminPage } from "./ui/AdminPage";
import { ProfilePanel } from "./ui/ProfilePanel";
import { ReminderToasts } from "./ui/ReminderToasts";
import { makeBoardNet } from "./game/boards";
import { DeskPanel } from "./ui/DeskPanel";
import { defaultDesk, loadDesk, saveDesk, type DeskCustom } from "./avatar/desk";
import type { DeskAction } from "./game/GameCanvas";
import { loadAvatar, randomAvatar, saveAvatar, type AvatarConfig } from "./avatar/config";
import { getStatus, startOAuth, type CalendarEvent, type GoogleStatus } from "./api/google";
import { isLive } from "./calendar/eventTime";
import { type PresenceStatus } from "./game/status";

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
  // Calendario a nivel de app (panel abierto o no) + avisos 15'/5'/ahora.
  const { events: calendarEvents, refreshEvents, syncing: calSyncing, lastSyncAt: calSyncAt, loaded: calLoaded } = useCalendarEvents();
  const reminders = useMeetingReminders(calendarEvents);
  const refreshCalendar = React.useCallback(() => {
    void refreshEvents();
  }, [refreshEvents]);
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
  // "Mi escritorio": one claimed desk per person (saved in this browser for now).
  const [myDesk, setMyDesk] = React.useState<DeskCustom | null>(() => loadDesk());
  const [deskDraft, setDeskDraft] = React.useState<DeskCustom | null>(null);
  const [deskPanel, setDeskPanel] = React.useState<{ roomName: string } | null>(null);
  const onDeskAction = React.useCallback(
    (a: DeskAction) => {
      if (a.type === "claim") {
        // Keep your decoration when moving to another desk.
        const next = myDesk ? { ...myDesk, deskId: a.deskId } : defaultDesk(a.deskId);
        setMyDesk(next);
        saveDesk(next);
      }
      setDeskPanel({ roomName: a.roomName });
    },
    [myDesk],
  );
  const saveProfile = React.useCallback((cfg: AvatarConfig) => {
    saveAvatar(cfg);
    setAvatar(cfg);
    setDraftAvatar(null);
    setProfileOpen(false);
    setProfileIsNew(false);
  }, []);
  const { status, roster, messages, sendChat, net, meetUrl, objects } = useColyseusRoom(name, { avatar });
  const voice = useMeshVoice(net);

  // Presencia: se publica al servidor (aro + insignia + audio de los demás).
  const [myStatus, setMyStatusState] = React.useState<PresenceStatus>("available");
  // Solo revierte el "En reunión" que puso el auto-join (el manual persiste).
  const autoMeetingRef = React.useRef(false);
  const setMyStatus = React.useCallback((s: PresenceStatus) => {
    if (s !== "meeting") autoMeetingRef.current = false;
    setMyStatusState(s);
    net.sendStatus(s);
  }, [net]);

  // Micrófono: focus/meeting/away lo apagan (además del botón manual de voz).
  React.useEffect(() => {
    voice.setStatusMuted(myStatus === "focus" || myStatus === "meeting" || myStatus === "away");
  }, [myStatus, voice.setStatusMuted]);

  // "Ir al Meet" pone "En reunión" solo si el evento está en curso.
  const onJoinMeet = React.useCallback((e: CalendarEvent) => {
    if (isLive(e, Date.now())) {
      autoMeetingRef.current = true;
      setMyStatus("meeting");
    }
  }, [setMyStatus]);

  // El "En reunión" automático se revierte solo cuando ya no hay evento en curso.
  React.useEffect(() => {
    if (myStatus !== "meeting" || !autoMeetingRef.current || !calLoaded) return;
    if (!calendarEvents.some((e) => isLive(e, reminders.now))) {
      autoMeetingRef.current = false;
      setMyStatus("available");
    }
  }, [myStatus, calLoaded, calendarEvents, reminders.now, setMyStatus]);

  // Publica el avatar real para que los demás vean tu skin (también al guardarlo).
  React.useEffect(() => {
    net.sendAvatar(avatar);
  }, [avatar, net]);

  const onNearby = React.useCallback((ids: string[]) => setNearby(ids), []);
  const onObject = React.useCallback((obj: SmartObject | null) => setActiveObject(obj), []);
  const [playerPos, setPlayerPos] = React.useState({ x: 1600, y: 1664 });
  const onPosition = React.useCallback((x: number, y: number) => setPlayerPos({ x, y }), []);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(true);
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
        {calendarOpen && (
          <GooglePanel
            events={reminders.upcoming}
            now={reminders.now}
            syncing={calSyncing}
            lastSyncAt={calSyncAt}
            notifyPermission={reminders.permission}
            onEnableNotifications={() => void reminders.requestPermission()}
            onChanged={refreshCalendar}
            onJoinMeet={onJoinMeet}
          />
        )}
        <Sidebar
        roster={roster}
        nearby={nearby}
        messages={messages}
        sendChat={sendChat}
        chatOpen={chatOpen}
        onCloseChat={() => setChatOpen(false)}
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
      {isAdmin && adminMode && <AdminPanel net={net} objects={objects} editing={adminMode} playerX={playerPos.x} playerY={playerPos.y} />}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          title="Mostrar chat general"
          aria-label="Abrir chat"
          style={{ position: "absolute", right: 0, bottom: 16, zIndex: 20, width: 40, height: 48, borderRadius: "12px 0 0 12px", border: "1px solid var(--q-line)", borderRight: "none", background: "var(--q-orange)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "-2px 2px 10px rgba(0,0,0,0.18)" }}
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 3h11v8h-6l-3 2.5v-2.5h-2v-8z" />
            <path d="M5.5 6h5M5.5 8.2h3" />
          </svg>
        </button>
      )}
      <GameCanvas name={name} avatar={draftAvatar ?? avatar} myDesk={deskDraft ?? myDesk} onDeskAction={onDeskAction} net={net} netStatus={status} objects={objects} isAdmin={isAdmin} adminMode={adminMode} onNearby={onNearby} onObject={onObject} onPosition={onPosition} onAdminModeChange={setAdminMode} calendarOpen={calendarOpen} onCalendarOpenChange={setCalendarOpen} onEditProfile={() => setProfileOpen(true)} audio={voice.audio} myStatus={myStatus} onStatusChange={setMyStatus} />
      <ReminderToasts toasts={reminders.toasts} events={calendarEvents} onDismiss={reminders.dismiss} onJoinMeet={onJoinMeet} />
      {deskPanel && myDesk && (
        <DeskPanel
          value={myDesk}
          roomName={deskPanel.roomName}
          onPreview={setDeskDraft}
          onSave={(d) => {
            setMyDesk(d);
            saveDesk(d);
            setDeskDraft(null);
            setDeskPanel(null);
          }}
          onRelease={() => {
            setMyDesk(null);
            saveDesk(null);
            setDeskDraft(null);
            setDeskPanel(null);
          }}
          onClose={() => {
            setDeskDraft(null);
            setDeskPanel(null);
          }}
        />
      )}
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
      {activeObject && !profileOpen && !deskPanel && (
        <SmartObjectModal
          obj={activeObject}
          liveMeetUrl={meetUrl}
          calendarMeets={reminders.upcoming}
          boardNet={makeBoardNet(() => net.getRoom(), net.sendBoardScene, activeObject.id)}
          onPublishMeet={onPublishMeet}
          onClose={() => setActiveObject(null)}
        />
      )}
    </div>
  );
}

/** Design-preview mode: skips Google login so the UI can be reviewed without a server. */
const DEMO = import.meta.env.VITE_DEMO === "1";

/** Hash routing sin dependencias: "" o "#/" = juego, "#/admin" = administración. */
function useRoute(): string {
  const [hash, setHash] = React.useState(() => window.location.hash);
  React.useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

const goGame = () => {
  window.location.hash = "#/";
};

export function App() {
  const [auth, setAuth] = React.useState<GoogleStatus | null>(null);

  const [demoIn, setDemoIn] = React.useState(false);
  const route = useRoute();

  if (DEMO) {
    if (route === "#/admin") {
      return demoIn ? (
        <AdminPage name="Invitado Demo" myEmail="" onBack={goGame} />
      ) : (
        <LoginGate onAuthorized={() => undefined} onDemoLogin={() => setDemoIn(true)} />
      );
    }
    return demoIn ? (
      <GameApp name="Invitado Demo" isAdmin />
    ) : (
      <LoginGate onAuthorized={() => undefined} onDemoLogin={() => setDemoIn(true)} />
    );
  }

  if (route === "#/admin") {
    if (!auth || !auth.authorized) {
      return <LoginGate onAuthorized={setAuth} />;
    }
    if (auth.role !== "admin") {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0e1424",
            color: "#e8ecf4",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <h1 style={{ fontSize: 20 }}>Sin acceso</h1>
            <p style={{ color: "#9aa6bd", fontSize: 14 }}>
              Esta página es solo para cuentas con rol admin.
            </p>
            <button type="button" className="q-btn q-btn--sm" onClick={goGame}>
              ← Volver al juego
            </button>
          </div>
        </main>
      );
    }
    return (
      <AdminPage
        name={displayName(auth.email ?? "user")}
        myEmail={auth.email ?? ""}
        onBack={goGame}
      />
    );
  }

  if (!auth || !auth.authorized) {
    return <LoginGate onAuthorized={setAuth} />;
  }
  return <GameApp name={displayName(auth.email ?? "user")} isAdmin={auth.role === "admin"} />;
}
