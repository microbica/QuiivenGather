import React from "react";
import { GameCanvas } from "./game/GameCanvas";
import { useColyseusRoom } from "./game/useColyseus";
import { useMeshVoice } from "./game/useMeshVoice";
import type { SmartObject } from "./game/objects";
import { Sidebar } from "./ui/Sidebar";
import { SmartObjectModal } from "./ui/SmartObjectModal";
import { VoicePanel } from "./ui/VoicePanel";
import { GooglePanel } from "./ui/GooglePanel";
import type { CalendarEvent } from "./api/google";

function initialName(): string {
  const saved = localStorage.getItem("gq-name");
  if (saved?.trim()) return saved;
  return `guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function App() {
  const [name, setName] = React.useState(initialName);
  const [nearby, setNearby] = React.useState<string[]>([]);
  const [activeObject, setActiveObject] = React.useState<SmartObject | null>(null);
  const [calendarMeets, setCalendarMeets] = React.useState<CalendarEvent[]>([]);
  const { status, roster, messages, sendChat, net, meetUrl } = useColyseusRoom(name);
  const voice = useMeshVoice(net);

  const onName = React.useCallback((n: string) => {
    setName(n);
    localStorage.setItem("gq-name", n);
  }, []);

  const onPublishMeet = React.useCallback(
    (url: string) => {
      net.sendSetMeet(url);
    },
    [net],
  );

  const onNearby = React.useCallback((ids: string[]) => {
    setNearby(ids);
  }, []);

  const onObject = React.useCallback((obj: SmartObject | null) => {
    setActiveObject(obj);
  }, []);

  // Malla P2P sigue a la lista de proximidad (capada a MESH_MAX_PEERS).
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
        onName={onName}
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
      <GooglePanel net={net} onEvents={setCalendarMeets} />
      <GameCanvas name={name} net={net} onNearby={onNearby} onObject={onObject} audio={voice.audio} />
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
