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
    <div className="q-video">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{ width: small ? 112 : 176, height: small ? 84 : 132 }}
      />
      <span>{label}</span>
    </div>
  );
}

export function VoicePanel(props: Props) {
  const {
    supported, active, error, localStream, remoteStreams,
    mutedAudio, mutedVideo, peerNames, onStart, onStop, onToggleAudio, onToggleVideo,
  } = props;

  return (
    <div className="q-panel q-dock">
      {!supported && <div className="q-small">Tu navegador no permite voz ni video.</div>}
      {supported && !active && (
        <button className="q-btn q-btn--primary" onClick={onStart}>
          🎙 Activar micrófono y cámara
        </button>
      )}
      {supported && active && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              className="q-btn q-btn--icon"
              onClick={onToggleAudio}
              aria-label={mutedAudio ? "Activar micrófono" : "Silenciar micrófono"}
              title={mutedAudio ? "Activar micrófono" : "Silenciar micrófono"}
              style={mutedAudio ? { background: "var(--q-flame)" } : undefined}
            >
              {mutedAudio ? "🔇" : "🎤"}
            </button>
            <button
              className="q-btn q-btn--icon"
              onClick={onToggleVideo}
              aria-label={mutedVideo ? "Encender cámara" : "Apagar cámara"}
              title={mutedVideo ? "Encender cámara" : "Apagar cámara"}
              style={mutedVideo ? { background: "var(--q-flame)" } : undefined}
            >
              {mutedVideo ? "📷" : "📹"}
            </button>
            <button className="q-btn q-btn--icon" onClick={onStop} aria-label="Salir de la llamada" title="Salir de la llamada">
              ⏹
            </button>
          </div>
          {localStream && <Video stream={localStream} label="Tú" muted small />}
          {[...remoteStreams.entries()].map(([id, s]) => (
            <Video key={id} stream={s} label={peerNames.get(id) ?? id.slice(0, 4)} />
          ))}
          {remoteStreams.size === 0 && (
            <div className="q-small q-muted" style={{ maxWidth: 160 }}>
              Acércate a alguien para conectar (hasta 5 personas).
            </div>
          )}
        </>
      )}
      {error && <div className="q-small" style={{ color: "var(--q-orange)" }}>{error}</div>}
    </div>
  );
}
