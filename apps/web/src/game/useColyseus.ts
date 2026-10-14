import React from "react";
import { Client, getStateCallbacks } from "colyseus.js";
import type { Room } from "colyseus.js";
import type { GameState } from "@quiiven/protocol";

export interface MoveOut {
  x: number;
  y: number;
  dir: string;
  anim: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  self: boolean;
}

export interface ChatEntry {
  name: string;
  text: string;
  ts: number;
}

export interface NetHandle {
  getRoom(): Room<GameState> | null;
  sessionId: string | null;
  sendMove(m: MoveOut): void;
}

export type NetStatus = "connecting" | "online" | "offline";

const URL = import.meta.env.VITE_COLYSEUS_URL ?? "ws://localhost:2567";

/**
 * Single Colyseus connection. The NetHandle is ref-stable so the Pixi
 * ticker can poll it every frame without re-renders; roster/chat/status
 * go through React state for the DOM sidebar.
 */
export function useColyseusRoom(name: string) {
  const roomRef = React.useRef<Room<GameState> | null>(null);
  const [status, setStatus] = React.useState<NetStatus>("connecting");
  const [roster, setRoster] = React.useState<RosterEntry[]>([]);
  const [messages, setMessages] = React.useState<ChatEntry[]>([]);
  const [net] = React.useState<NetHandle>(() => ({
    getRoom: () => roomRef.current,
    sessionId: null,
    sendMove: (m) => roomRef.current?.send("move", m),
  }));

  React.useEffect(() => {
    let cancelled = false;
    let room: Room<GameState> | null = null;
    setStatus("connecting");
    setRoster([]);
    (async () => {
      room = await new Client(URL).joinOrCreate<GameState>("game", { name });
      if (cancelled) {
        await room.leave();
        return;
      }
      roomRef.current = room;
      net.sessionId = room.sessionId;
      const syncRoster = () => {
        const list: RosterEntry[] = [];
        room?.state.players.forEach((p, id) => {
          list.push({ id, name: p.name, self: id === room?.sessionId });
        });
        list.sort((a, b) => Number(a.self) - Number(b.self));
        setRoster(list);
      };
      // schema v3: collection callbacks via getStateCallbacks proxy.
      const $ = getStateCallbacks(room);
      $(room.state).players.onAdd(() => syncRoster());
      $(room.state).players.onRemove(() => syncRoster());
      $(room.state).messages.onAdd((m) => {
        setMessages((prev) => [...prev.slice(-49), { name: m.name, text: m.text, ts: m.ts }]);
      });
      syncRoster();
      setStatus("online");
    })().catch(() => {
      if (!cancelled) setStatus("offline");
    });
    return () => {
      cancelled = true;
      net.sessionId = null;
      roomRef.current = null;
      room?.leave().catch(() => undefined);
      room = null;
    };
  }, [name, net]);

  const sendChat = React.useCallback((text: string) => {
    roomRef.current?.send("chat", { text });
  }, []);

  return { status, roster, messages, sendChat, net };
}
