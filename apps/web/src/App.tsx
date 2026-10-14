import React from "react";
import { GameCanvas } from "./game/GameCanvas";
import { useColyseusRoom } from "./game/useColyseus";
import { Sidebar } from "./ui/Sidebar";

function initialName(): string {
  const saved = localStorage.getItem("gq-name");
  if (saved?.trim()) return saved;
  return `guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function App() {
  const [name, setName] = React.useState(initialName);
  const [nearby, setNearby] = React.useState<string[]>([]);
  const { status, roster, messages, sendChat, net } = useColyseusRoom(name);

  const onName = React.useCallback((n: string) => {
    setName(n);
    localStorage.setItem("gq-name", n);
  }, []);

  const onNearby = React.useCallback((ids: string[]) => {
    setNearby(ids);
  }, []);

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
      <GameCanvas name={name} net={net} onNearby={onNearby} />
    </div>
  );
}
