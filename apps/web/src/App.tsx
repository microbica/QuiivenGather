import React from "react";
import { GameCanvas } from "./game/GameCanvas";
import { useColyseusRoom } from "./game/useColyseus";
import { useMeshVoice } from "./game/useMeshVoice";
import { Sidebar } from "./ui/Sidebar";
import { VoicePanel } from "./ui/VoicePanel";

function initialName(): string {
  const saved = localStorage.getItem("gq-name");
  if (saved?.trim()) return saved;
  return `guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function App() {
  const [name, setName] = React.useState(initialName);
  const [nearby, setNearby] = React.useState<string[]>([]);
  const { status, roster, messages, sendChat, net } = useColyseusRoom(name);
  const voice = useMeshVoice(net);

  const onName = React.useCallback((n: string) => {
    setName(n);
    localStorage.setItem("gq-name", n);
  }, []);

  const onNearby = React.useCallback((ids: string[]) => {
    setNearby(ids);
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
      <GameCanvas name={name} net={net} onNearby={onNearby} audio={voice.audio} />
    </div>
  );
}
