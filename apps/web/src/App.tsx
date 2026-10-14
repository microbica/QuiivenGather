import React from "react";
import { GameCanvas } from "./game/GameCanvas";

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL ?? "ws://localhost:2567";

export function App() {
  const [serverStatus, setServerStatus] = React.useState<
    "checking" | "online" | "offline"
  >("checking");

  React.useEffect(() => {
    let cancelled = false;
    const url = COLYSEUS_URL.replace(/^ws/, "http");
    fetch(`${url}/health`)
      .then(
        (r): Promise<"online" | "offline"> =>
          r.ok ? Promise.resolve("online") : Promise.resolve("offline"),
      )
      .catch((): Promise<"online" | "offline"> => Promise.resolve("offline"))
      .then((s) => {
        if (!cancelled) setServerStatus(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ margin: 0 }}>
      <div
        style={{
          position: "absolute", top: 12, right: 12, zIndex: 10,
          background: "rgba(10,12,18,0.72)", color: "#e8ecf4", fontSize: 12,
          fontFamily: "system-ui", padding: "6px 10px", borderRadius: 8,
        }}
      >
        server: <strong>{serverStatus}</strong>
      </div>
      <GameCanvas />
    </div>
  );
}
