import React from "react";
import { Excalidraw, exportToBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { loadBoardScene, saveBoardScene, type BoardScene } from "../game/boards";

const SAVE_DEBOUNCE_MS = 2500;
const RELAY_DEBOUNCE_MS = 800;

export interface BoardNet {
  /** Escucha escenas retransmitidas por el room (mismo boardId). */
  onScene(cb: (elements: readonly ExcalidrawElement[]) => void): () => void;
  /** Envía la escena al resto por TCP. */
  sendScene(boardId: string, elements: readonly ExcalidrawElement[]): void;
}

/** Pizarra colaborativa: editor Excalidraw por objeto (cada board = su sala). */
export function BoardModal({
  boardId,
  label,
  net,
  onClose,
}: {
  boardId: string;
  label: string;
  net: BoardNet;
  onClose: () => void;
}) {
  const [scene, setScene] = React.useState<BoardScene | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState("");
  const [exporting, setExporting] = React.useState(false);

  const sceneRef = React.useRef<BoardScene>({ elements: [] });
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRef = React.useRef<BoardNet>(net);
  roomRef.current = net;

  // Carga inicial: escena guardada (o vacía la primera vez).
  React.useEffect(() => {
    let cancelled = false;
    void loadBoardScene(boardId).then((s) => {
      if (cancelled) return;
      if (s) sceneRef.current = { elements: [...s.elements] };
      setScene({ elements: sceneRef.current.elements });
    });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const persist = React.useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveBoardScene(boardId, { elements })
          .then(() => setSavedAt(Date.now()))
          .catch((e: unknown) => setError(e instanceof Error ? e.message : "no se pudo guardar"));
      }, SAVE_DEBOUNCE_MS);
    },
    [boardId],
  );

  const onChange = React.useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      const list = elements.filter((el) => !el.isDeleted);
      sceneRef.current = { elements: list };
      setScene({ elements: list });
      if (relayTimer.current) clearTimeout(relayTimer.current);
      relayTimer.current = setTimeout(() => roomRef.current.sendScene(boardId, list), RELAY_DEBOUNCE_MS);
      persist(list);
    },
    [boardId, persist],
  );

  // Escenas de los demás: el relay llega por onMessage("board-scene") del room.
  React.useEffect(() => {
    return net.onScene((elements) => {
      sceneRef.current = { elements };
      setScene({ elements });
    });
  }, [net]);

  const download = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };

  const onExportJson = () => {
    const json = serializeAsJSON(sceneRef.current.elements as ExcalidrawElement[], {}, {}, "local");
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    download(url, `${label || "pizarra"}.excalidraw`);
    URL.revokeObjectURL(url);
  };

  const onExportPng = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await exportToBlob({
        elements: sceneRef.current.elements as ExcalidrawElement[],
        appState: { exportBackground: true },
        files: {},
      });
      const url = URL.createObjectURL(blob);
      download(url, `${label || "pizarra"}.png`);
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo exportar PNG");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div role="dialog" aria-label={label} className="q-panel q-modal">
      <div className="q-modal__head">
        <h2>{label}</h2>
        <span className="q-small q-muted" style={{ marginLeft: 8 }}>
          {savedAt ? "Guardado" : "Guardando automático…"}
        </span>
        <button className="q-btn q-btn--ghost q-btn--sm" onClick={onExportJson} disabled={!scene}>
          Guardar archivo
        </button>
        <button className="q-btn q-btn--ghost q-btn--sm" onClick={() => void onExportPng()} disabled={!scene || exporting}>
          {exporting ? "Exportando…" : "Exportar PNG"}
        </button>
        <button className="q-btn q-btn--icon" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      {error && (
        <div className="q-modal__body" style={{ paddingBottom: 4, color: "#ef4444" }}>
          {error}
        </div>
      )}
      <div className="q-modal__board">
        {scene ? (
          <Excalidraw
            initialData={scene}
            onChange={onChange}
            langCode="es"
            viewModeEnabled={false}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                export: false,
                saveAsImage: false,
                saveToActiveFile: false,
              },
            }}
          />
        ) : (
          <div className="q-muted" style={{ display: "grid", placeItems: "center", height: "100%" }}>
            Cargando pizarra…
          </div>
        )}
      </div>
    </div>
  );
}
