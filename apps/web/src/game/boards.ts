import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Room } from "colyseus.js";
import type { GameState } from "@quiiven/protocol";
import type { NetHandle } from "./useColyseus";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:2567";

/** Escena mínima de Excalidraw que persistimos (solo los elementos). */
export interface BoardScene {
  elements: readonly ExcalidrawElement[];
}

/** Interfaz de pizarra colaborativa (conexión por room). */
export interface BoardNet {
  /** Escucha escenas retransmitidas por el room (mismo boardId). */
  onScene(cb: (elements: readonly ExcalidrawElement[]) => void): () => void;
  /** Envía la escena al resto por TCP. */
  sendScene(boardId: string, elements: readonly ExcalidrawElement[]): void;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!r.ok) throw new Error(`boards ${r.status}`);
  return (await r.json()) as T;
}

/** Carga la escena guardada de una pizarra (null = vacía). */
export async function loadBoardScene(boardId: string): Promise<BoardScene | null> {
  try {
    const body = await api<{ scene: { elements: ExcalidrawElement[] } | null }>(
      `/api/boards/${encodeURIComponent(boardId)}`,
    );
    if (!body.scene || !Array.isArray(body.scene.elements)) return null;
    return { elements: body.scene.elements };
  } catch {
    return null; // sin sesión o sin servidor: pizarra vacía en memoria
  }
}

/** Guarda la escena de una pizarra (persistencia en Postgres). */
export function saveBoardScene(boardId: string, scene: BoardScene): Promise<void> {
  return api(`/api/boards/${encodeURIComponent(boardId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "excalidraw", version: 2, ...scene }),
  }).then(() => undefined);
}

/**
 * Conecta el room con la interfaz de pizarra (por boardId, sin deps pesadas:
 * este módulo NO importa Excalidraw, así el editor queda en un chunk propio).
 */
export function makeBoardNet(
  getRoom: () => Room<GameState> | null,
  sendBoardScene: (boardId: string, elements: readonly unknown[]) => void,
  boardId: string,
): BoardNet {
  return {
    onScene(cb) {
      const room = getRoom();
      if (!room) return () => undefined;
      const handler = (m: { boardId?: string; elements?: readonly ExcalidrawElement[] }) => {
        if (m.boardId === boardId && Array.isArray(m.elements)) cb(m.elements);
      };
      room.onMessage("board-scene", handler);
      return () => room.onMessage("board-scene", () => undefined);
    },
    sendScene: (id, elements) => sendBoardScene(id, elements),
  };
}

/** Envía la escena al resto vía NetHandle (uso directo sin room). */
export function boardNet(net: NetHandle): Pick<BoardNet, "sendScene"> {
  return {
    sendScene: (boardId, elements) => net.sendBoardScene(boardId, elements),
  };
}
