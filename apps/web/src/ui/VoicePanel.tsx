import React from "react";

interface Props {
  supported: boolean;
  active: boolean;
  error: string | null;
  localStream: MediaStream | null;
  remoteStreams: ReadonlyMap<string, MediaStream>;
  mutedAudio: boolean;
  mutedVideo: boolean;
  peerNames: Map<string, string>;
  onStart: () => void;
  onStop: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
}

function Video({
  stream,
  label,
  muted = false,
  small = false,
}: {
  stream: MediaStream;
  label: string;
  muted?: boolean;
  small?: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div style={{ textAlign: "center" }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: small ? 96 : 160,
          height: small ? 72 : 120,
          background: "#000",
          borderRadius: 8,
          objectFit: "cover",
        }}
      />
      <div style={{ fontSize: 11 }}>{label}</div>
    </div>
  );
}

export function VoicePanel(props: Props) {
  const {
    supported, active, error, localStream, remoteStreams,
    mutedAudio, mutedVideo, peerNames, onStart, onStop, onToggleAudio, onToggleVideo,
  } = props;

  return (
    <div
      style={{
        position: "absolute", bottom: 12, left: 12, zIndex: 10,
        background: "rgba(10,12,18,0.82)", color: "#e8ecf4", fontSize: 13,
        fontFamily: "system-ui", borderRadius: 8, padding: "8px 10px",
        maxWidth: "calc(100vw - 300px)",
      }}
    >
      {!supported && <div>WebRTC no soportado en este navegador.</div>}
      {supported && !active && (
        <button onClick={onStart} style={{ cursor: "pointer", padding: "6px 12px" }}>
          🎙 Activar voz/video (máx 5 por proximidad)
        </button>
      )}
      {supported && active && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={onToggleAudio} style={{ cursor: "pointer" }}>
              {mutedAudio ? "🔇 mic off" : "🎤 mic on"}
            </button>
            <button onClick={onToggleVideo} style={{ cursor: "pointer" }}>
              {mutedVideo ? "📷 cam off" : "📹 cam on"}
            </button>
            <button onClick={onStop} style={{ cursor: "pointer" }}>⏹ salir</button>
          </div>
          {localStream && <Video stream={localStream} label="tú" muted small />}
          {[...remoteStreams.entries()].map(([id, s]) => (
            <Video key={id} stream={s} label={peerNames.get(id) ?? id.slice(0, 4)} />
          ))}
          {remoteStreams.size === 0 && (
            <div style={{ opacity: 0.6, alignSelf: "center" }}>
              acércate a alguien para conectar…
            </div>
          )}
        </div>
      )}
      {error && <div style={{ color: "#ff8888" }}>{error}</div>}
    </div>
  );
}
