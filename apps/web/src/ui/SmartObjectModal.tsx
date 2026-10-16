import React from "react";
import { objectOrigin, type SmartObject } from "../game/objects";
import type { CalendarEvent } from "../api/google";
import { lazy, Suspense } from "react";
import type { BoardNet } from "./BoardModal";

// El editor Excalidraw es pesado: solo se descarga al abrir una pizarra.
const BoardModal = lazy(() =>
  import("./BoardModal").then((m) => ({ default: m.BoardModal })),
);

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
  boardNet,
  onPublishMeet,
  onClose,
}: {
  obj: SmartObject;
  /** Meet en vivo publicado por un usuario vinculado (Fase 4.5). */
  liveMeetUrl?: string;
  /** Eventos del calendario con Meet para publicar en la TV (Fase 4.5). */
  calendarMeets?: CalendarEvent[];
  /** Conexión de pizarra colaborativa (solo para kind=board). */
  boardNet?: BoardNet;
  onPublishMeet?: (url: string) => void;
  onClose: () => void;
}) {
  // Pizarras: editor Excalidraw colaborativo (cada board = su documento).
  if (obj.kind === "board" && boardNet) {
    return (
      <Suspense
        fallback={
          <div role="dialog" aria-label={obj.label} className="q-panel q-modal">
            <div className="q-modal__head">
              <h2>{obj.label}</h2>
            </div>
            <div className="q-muted" style={{ display: "grid", placeItems: "center", flex: 1 }}>
              Cargando pizarra…
            </div>
          </div>
        }
      >
        <BoardModal boardId={obj.id} label={obj.label} net={boardNet} onClose={onClose} />
      </Suspense>
    );
  }
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
    <div role="dialog" aria-label={obj.label} className="q-panel q-modal">
      <div className="q-modal__head">
        <h2>{obj.label}</h2>
        {origin && (
          <a className="q-btn q-btn--ghost q-btn--sm" href={effectiveUrl} target="_blank" rel="noreferrer">
            Abrir en pestaña ↗
          </a>
        )}
        <button className="q-btn q-btn--icon" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      {obj.kind === "meet" ? (
        liveMeetUrl ? (
          <div className="q-modal__body" style={{ textAlign: "center" }}>
            <p style={{ fontSize: 20, fontWeight: 700, margin: "24px 0 6px" }}>
              Hay una reunión en vivo en esta TV
            </p>
            <p className="q-muted" style={{ margin: "0 0 20px" }}>
              Google Meet se abre en otra pestaña.
            </p>
            <a className="q-btn q-btn--primary" href={liveMeetUrl} target="_blank" rel="noreferrer">
              Unirme a la reunión ↗
            </a>
            <p className="q-small q-muted" style={{ marginTop: 14, wordBreak: "break-all" }}>
              {liveMeetUrl}
            </p>
          </div>
        ) : (
          <>
            <p className="q-modal__body" style={{ margin: 0, paddingBottom: 8 }}>
              Esta TV muestra la reunión en curso. Elige una de tu calendario:
            </p>
            {calendarMeets && calendarMeets.some((e) => e.hangoutLink) ? (
              <ul style={{ margin: 0, padding: "0 24px 24px 40px", fontSize: 14 }}>
                {calendarMeets
                  .filter((e) => e.hangoutLink)
                  .map((e) => (
                    <li key={e.id} style={{ marginBottom: 8 }}>
                      {e.summary}{" "}
                      <button
                        className="q-btn q-btn--sm"
                        onClick={() => onPublishMeet?.(e.hangoutLink)}
                      >
                        Llevar a la TV
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="q-muted" style={{ padding: "0 24px 24px", margin: 0 }}>
                Conecta tu Google Calendar en el panel “Mi día” y crea o elige
                una reunión para verla aquí.
              </p>
            )}
          </>
        )
      ) : !origin ? (
        <div className="q-modal__body">
          <p>Este objeto no tiene un enlace válido configurado.</p>
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
