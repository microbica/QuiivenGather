import React from "react";
import { objectOrigin, type SmartObject } from "../game/objects";
import type { CalendarEvent } from "../api/google";

export interface SmartEvent {
  type: "OBJECT_ENTER" | "OBJECT_LEAVE";
  objectId: string;
  at: number;
}

/**
 * Sandboxed embed for a Smart Object (Fase 4).
 * - iframe sandbox WITHOUT allow-same-origin (opaque origin, isolated).
 * - postMessage bus with strict event.origin validation both ways.
 * - Meet links also get an "open in tab" fallback (some providers block embeds).
 */
export function SmartObjectModal({
  obj,
  liveMeetUrl,
  calendarMeets,
  onPublishMeet,
  onClose,
}: {
  obj: SmartObject;
  /** Meet en vivo publicado por un usuario vinculado (Fase 4.5). */
  liveMeetUrl?: string;
  /** Eventos del calendario con Meet para publicar en la TV (Fase 4.5). */
  calendarMeets?: CalendarEvent[];
  onPublishMeet?: (url: string) => void;
  onClose: () => void;
}) {
  // Para kind=meet, el Meet en vivo del room tiene prioridad sobre la URL estática.
  const effectiveUrl =
    obj.kind === "meet" && liveMeetUrl ? liveMeetUrl : obj.url;
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const origin = objectOrigin(effectiveUrl);

  const post = React.useCallback(
    (type: SmartEvent["type"]) => {
      const frame = frameRef.current;
      if (!frame?.contentWindow || !origin) return;
      const msg: SmartEvent = { type, objectId: obj.id, at: Date.now() };
      frame.contentWindow.postMessage(msg, origin);
    },
    [obj.id, origin],
  );

  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!origin || e.origin !== origin) return; // reject untrusted origins
      console.debug(`[smart] <== ${obj.id}:`, e.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      // Best-effort leave notice (frame unmounts right after).
      try {
        frameRef.current?.contentWindow?.postMessage(
          { type: "OBJECT_LEAVE", objectId: obj.id, at: Date.now() } satisfies SmartEvent,
          origin || "*",
        );
      } catch {
        /* frame already gone */
      }
    };
  }, [obj.id, origin]);

  return (
    <div
      role="dialog"
      aria-label={obj.label}
      style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 20, width: "min(860px, 92vw)", height: "min(600px, 84vh)",
        background: "#10141d", color: "#e8ecf4", borderRadius: 12,
        border: "1px solid #333c52", display: "flex", flexDirection: "column",
        overflow: "hidden", fontFamily: "system-ui",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
        <strong style={{ flex: 1 }}>{obj.label}</strong>
        {origin && (
          <a href={effectiveUrl} target="_blank" rel="noreferrer" style={{ color: "#9cc8ff", fontSize: 13 }}>
            Abrir en pestaña ↗
          </a>
        )}
        <button onClick={onClose} style={{ cursor: "pointer" }}>✕</button>
      </div>
      {obj.kind === "meet" ? (
        liveMeetUrl ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <p style={{ fontSize: 15, marginBottom: 4 }}>
              Meet en vivo en la TV
            </p>
            <p style={{ fontSize: 12, color: "#9aa", marginBottom: 16 }}>
              Google Meet no permite embeberse en iframe; únete desde tu
              pestaña.
            </p>
            <a
              href={liveMeetUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                background: "#1a73e8",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Unirse a Meet ↗
            </a>
            <p style={{ fontSize: 11, color: "#789", marginTop: 12, wordBreak: "break-all" }}>
              {liveMeetUrl}
            </p>
          </div>
        ) : (
          <>
            <p style={{ padding: 16, fontSize: 14, lineHeight: 1.6 }}>
              Esta TV muestra un Meet en vivo. Publica uno:
            </p>
            {calendarMeets && calendarMeets.some((e) => e.hangoutLink) ? (
              <ul style={{ margin: 0, padding: "0 16px 16px", fontSize: 14 }}>
                {calendarMeets
                  .filter((e) => e.hangoutLink)
                  .map((e) => (
                    <li key={e.id} style={{ marginBottom: 8 }}>
                      {e.summary}{" "}
                      <button
                        onClick={() => onPublishMeet?.(e.hangoutLink)}
                        style={{ cursor: "pointer" }}
                      >
                        Publicar en TV
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p style={{ padding: "0 16px 16px", fontSize: 13 }}>
                Vincula Google (panel superior derecho) y crea/publica una
                reunión para verla aquí.
              </p>
            )}
          </>
        )
      ) : !origin ? (
        <div style={{ padding: 24, fontSize: 14, lineHeight: 1.6 }}>
          <p>URL no válida para este objeto.</p>
        </div>
      ) : (
        <iframe
          ref={frameRef}
          title={obj.label}
          src={effectiveUrl}
          sandbox="allow-scripts allow-forms allow-popups"
          allow="camera; microphone; display-capture; fullscreen"
          onLoad={() => post("OBJECT_ENTER")}
          style={{ flex: 1, border: 0, background: "#fff" }}
        />
      )}
    </div>
  );
}
