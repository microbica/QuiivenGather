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
import { defaultDesk, sanitizeDesk, type DeskCustom } from "./avatar/desk";
import type { BubbleInfo, DeskAction, DeskView, Nav } from "./game/GameCanvas";
import type { Zone } from "./game/mapLoader";
import { isMeetingRoom } from "@quiiven/protocol";
import { RoomsPanel } from "./ui/RoomsPanel";
import { RoomBar } from "./ui/RoomBar";
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
  const [deskDraft, setDeskDraft] = React.useState<DeskCustom | null>(null);
  const [deskPanel, setDeskPanel] = React.useState<{ roomName: string } | null>(null);
  const saveProfile = React.useCallback((cfg: AvatarConfig) => {
    saveAvatar(cfg);
    setAvatar(cfg);
    setDraftAvatar(null);
    setProfileOpen(false);
    setProfileIsNew(false);
  }, []);
  const { status, roster, messages, sendChat, net, meetUrl, objects, locks, roomMeets, dms, knocks, dismissKnock, roomEvent, desks, myKey, deskEvent, deskAssigned, bubbleKnocks, dismissBubbleKnock, bubbleEvent } = useColyseusRoom(name, { avatar });

  // "Mi escritorio": desks are claimed on the server, one per person, so
  // everybody sees whose desk is whose and nobody can take a claimed one.
  const myDesk = React.useMemo<DeskCustom | null>(() => {
    const mine = Object.values(desks).find((d) => myKey && d.ownerKey === myKey);
    return mine ? sanitizeDesk({ ...mine.config, deskId: mine.deskId }) : null;
  }, [desks, myKey]);
  const deskViews = React.useMemo<DeskView[]>(
    () =>
      Object.values(desks).flatMap((d) => {
        const mine = !!myKey && d.ownerKey === myKey;
        const custom = mine && deskDraft ? deskDraft : sanitizeDesk({ ...d.config, deskId: d.deskId });
        return custom ? [{ custom, owner: d.owner, mine }] : [];
      }),
    [desks, myKey, deskDraft],
  );
  const onDeskAction = React.useCallback(
    (a: DeskAction) => {
      if (a.type === "claim") {
        // Keep your decoration when moving to another desk.
        const { deskId: _old, ...config } = myDesk ?? defaultDesk(a.deskId);
        void _old;
        net.sendDeskClaim(a.deskId, config);
      }
      setDeskPanel({ roomName: a.roomName });
    },
    [myDesk, net],
  );
  const voice = useMeshVoice(net);

  // ---- Rooms: list, walk-to, meeting-room bar, closed rooms ----
  const navRef = React.useRef<Nav | null>(null);
  const [zones, setZones] = React.useState<Zone[]>([]);
  const [currentZone, setCurrentZone] = React.useState<Zone | null>(null);
  const [occupancy, setOccupancy] = React.useState<Record<string, number>>({});
  const [toast, setToast] = React.useState<{ text: string; ts: number; action?: { label: string; run: () => void } } | null>(null);
  const say = React.useCallback(
    (text: string, action?: { label: string; run: () => void }) => setToast({ text, ts: Date.now(), action }),
    [],
  );
  React.useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.action ? 12000 : 4500);
    return () => window.clearTimeout(t);
  }, [toast]);
  /** Room whose Meet was already opened on this visit (no double tabs). */
  const meetOpenedFor = React.useRef("");
  const openRoomMeet = React.useCallback((zoneId: string) => {
    const url = roomMeets[zoneId];
    if (!url || meetOpenedFor.current === zoneId) return;
    meetOpenedFor.current = zoneId;
    // Browsers may block tabs not opened by a click: the bar keeps an "Abrir Meet" button.
    window.open(url, "_blank", "noopener");
  }, [roomMeets]);
  const goToRoom = React.useCallback(
    (z: Zone) => {
      const r = navRef.current?.goToZone(z.id);
      if (r === "locked") say(`🔒 ${z.label} está cerrada. Puedes tocar la puerta.`);
      else if (r === "far") say(`No encontré cómo llegar a ${z.label}.`);
      // Opened from this click so the browser lets the tab through.
      else if (r === "ok" && isMeetingRoom(z.id)) openRoomMeet(z.id);
    },
    [say, openRoomMeet],
  );
  // Entering a meeting room starts its call (and its Meet, if it has one).
  const zoneId = currentZone?.id ?? "";
  React.useEffect(() => {
    if (!zoneId || !isMeetingRoom(zoneId)) {
      meetOpenedFor.current = "";
      return;
    }
    if (!voice.active && voice.supported) void voice.start();
    openRoomMeet(zoneId);
    // Only on entering the room.
  }, [zoneId]);
  React.useEffect(() => {
    if (!roomEvent) return;
    const z = zones.find((q) => q.id === roomEvent.zone);
    if (roomEvent.type === "admitted") {
      navRef.current?.admit(roomEvent.zone);
      say(`✅ ${roomEvent.by} te dejó pasar a ${z?.label ?? "la sala"}`);
      if (z) goToRoom(z);
    } else say(`🔒 ${z?.label ?? "La sala"} está cerrada${roomEvent.by ? ` por ${roomEvent.by}` : ""}.`);
  }, [roomEvent]);
  const [chatUnread, setChatUnread] = React.useState(0);
  // Locked conversations ("burbujas") around you.
  const [bubble, setBubble] = React.useState<BubbleInfo>({ mine: null, lockedNear: null, canLock: false });
  const [knockedBubble, setKnockedBubble] = React.useState("");
  React.useEffect(() => {
    if (!bubble.lockedNear) setKnockedBubble("");
  }, [bubble.lockedNear]);
  React.useEffect(() => {
    if (!bubbleEvent) return;
    setKnockedBubble("");
    say(bubbleEvent.by ? `✅ ${bubbleEvent.by.split(" ")[0]} te dejó entrar a la conversación privada` : "✅ Te dejaron entrar a la conversación privada");
  }, [bubbleEvent, say]);
  const assignedShown = React.useRef(0);
  React.useEffect(() => {
    // Wait for the map so the toast can name the office.
    if (!deskAssigned || !zones.length || assignedShown.current === deskAssigned.ts) return;
    assignedShown.current = deskAssigned.ts;
    const room = zones.find((z) => z.id === deskAssigned.zone)?.label ?? "tu equipo";
    say(`🪑 ¡Ya tienes escritorio en ${room}! Te lo asignamos según tu equipo en Airtable.`, {
      label: "Ir a mi escritorio",
      run: () => navRef.current?.goToDesk(deskAssigned.deskId),
    });
  }, [deskAssigned, zones, say]);
  React.useEffect(() => {
    if (deskEvent) say(`🪑 Ese escritorio ya es de ${deskEvent.owner || "otra persona"}. Busca uno libre en tu equipo.`);
  }, [deskEvent, say]);

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
        dms={dms}
        sendDm={net.sendDm}
        onOpenChat={() => setChatOpen(true)}
        onUnreadChange={setChatUnread}
        bubble={bubble}
        bubbleKnocks={bubbleKnocks}
        onLockBubble={() => net.sendBubbleLock(nearby)}
        onLeaveBubble={() => {
          net.sendBubbleLeave();
          bubbleKnocks.forEach(dismissBubbleKnock);
        }}
        onAdmitBubble={(k) => {
          net.sendBubbleAdmit(k.from);
          dismissBubbleKnock(k);
        }}
        onDismissBubbleKnock={dismissBubbleKnock}
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
          {chatUnread > 0 && <span className="q-chat__badge q-chat__badge--tab">{chatUnread}</span>}
        </button>
      )}
      <GameCanvas name={name} avatar={draftAvatar ?? avatar} desks={deskViews} onDeskAction={onDeskAction} locks={locks} navRef={navRef} onZones={setZones} onZoneChange={setCurrentZone} onOccupancy={setOccupancy} onBubble={setBubble} net={net} netStatus={status} objects={objects} isAdmin={isAdmin} adminMode={adminMode} onNearby={onNearby} onObject={onObject} onPosition={onPosition} onAdminModeChange={setAdminMode} calendarOpen={calendarOpen} onCalendarOpenChange={setCalendarOpen} onEditProfile={() => setProfileOpen(true)} audio={voice.audio} myStatus={myStatus} onStatusChange={setMyStatus} />
      <RoomsPanel
        zones={zones}
        occupancy={occupancy}
        locks={locks}
        roomMeets={roomMeets}
        currentZoneId={zoneId}
        onGo={goToRoom}
        hasDesk={!!myDesk}
        onMyDesk={() => {
          if (!myDesk) {
            say("🪑 Aún no tienes escritorio: siéntate en uno libre de tu equipo y dale ★ Hacer mi escritorio.");
            return;
          }
          if (navRef.current?.goToDesk(myDesk.deskId) === "far") say("No encontré cómo llegar a tu escritorio.");
        }}
        onKnock={(z) => {
          net.sendKnock(z.id);
          say(`✊ Tocaste la puerta de ${z.label}. Espera a que te dejen pasar.`);
        }}
      />
      {currentZone && isMeetingRoom(currentZone.id) && (
        <RoomBar
          zone={currentZone}
          people={occupancy[currentZone.id] ?? 1}
          lockedBy={locks[currentZone.id]}
          meetUrl={roomMeets[currentZone.id]}
          voiceActive={voice.active}
          knocks={knocks.filter((k) => k.zone === currentZone.id)}
          onStartVoice={() => void voice.start()}
          onLock={(locked) => net.sendRoomLock(currentZone.id, locked)}
          onSetMeet={(url) => net.sendRoomMeet(currentZone.id, url)}
          onAdmit={(k) => {
            net.sendAdmit(k.zone, k.from);
            dismissKnock(k);
          }}
          onDismissKnock={dismissKnock}
        />
      )}
      {bubble.lockedNear && (
        <div className="q-panel q-bubble-near" role="status">
          <span className="q-bubble-near__lock" aria-hidden="true">🔒</span>
          <span>
            <strong>{listNames(bubble.lockedNear.names)}</strong> están en una conversación privada
          </span>
          {knockedBubble === bubble.lockedNear.bubble ? (
            <span className="q-small q-muted">Esperando que te dejen entrar…</span>
          ) : (
            <button
              type="button"
              className="q-btn q-btn--primary q-btn--sm"
              onClick={() => {
                net.sendBubbleKnock(bubble.lockedNear!.bubble);
                setKnockedBubble(bubble.lockedNear!.bubble);
              }}
            >
              Pedir unirme
            </button>
          )}
        </div>
      )}
      {toast && (
        <div key={toast.ts} className="q-panel q-toast" role="status">
          {toast.text}
          {toast.action && (
            <button
              type="button"
              className="q-btn q-btn--primary q-btn--sm"
              style={{ marginLeft: 10 }}
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      <ReminderToasts toasts={reminders.toasts} events={calendarEvents} onDismiss={reminders.dismiss} onJoinMeet={onJoinMeet} />
      {deskPanel && myDesk && (
        <DeskPanel
          value={myDesk}
          roomName={deskPanel.roomName}
          onPreview={setDeskDraft}
          onSave={(d) => {
            const { deskId: _id, ...config } = d;
            void _id;
            net.sendDeskUpdate(config);
            setDeskDraft(null);
            setDeskPanel(null);
          }}
          onRelease={() => {
            net.sendDeskRelease();
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

/** "Ana", "Ana y Juan", "Ana, Juan y 2 más". */
function listNames(names: string[]): string {
  const first = names.map((n) => n.split(" ")[0]);
  if (first.length <= 2) return first.join(" y ");
  return `${first[0]}, ${first[1]} y ${first.length - 2} más`;
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
