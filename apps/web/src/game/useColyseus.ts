import React from "react";
import { Client, getStateCallbacks } from "colyseus.js";
import type { Room } from "colyseus.js";
import type { GameState } from "@quiiven/protocol";
import type { AvatarConfig } from "../avatar/config";
import type { PresenceStatus } from "./status";
import type { SmartObject } from "./objects";

export interface MoveOut {
  x: number;
  y: number;
  dir: string;
  anim: string;
  zone: string;
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
  /** Publica el avatar visible (se valida en servidor y lo ven los demás). */
  sendAvatar(cfg: AvatarConfig): void;
  /** Publica el estado de presencia (allowlist en servidor). */
  sendStatus(status: PresenceStatus): void;
  /** Pizarra colaborativa: reenvía la escena al resto por TCP. */
  sendBoardScene(boardId: string, elements: readonly unknown[]): void;
  sendSetMeet(url: string): void;
  sendObjMove(id: string, x: number, y: number): void;
  sendObjAdd(
    label: string,
    kind: string,
    x: number,
    y: number,
    w?: number,
    h?: number,
    radius?: number,
    url?: string,
    material?: string,
    rotation?: number,
  ): void;
  sendObjRemove(id: string): void;
  sendObjRotate(id: string, rotation: number): void;
  sendObjUpdate(
    id: string,
    patch: {
      label?: string;
      kind?: SmartObject["kind"];
      material?: SmartObject["material"];
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      radius?: number;
      url?: string;
      rotation?: number;
    },
  ): void;
}

export type NetStatus = "connecting" | "online" | "offline" | "demo";

/** Design preview: no server; objects load from public JSON and edits stay local. */
const DEMO = import.meta.env.VITE_DEMO === "1";

const URL = import.meta.env.VITE_COLYSEUS_URL ?? "ws://localhost:2567";

/**
 * Single Colyseus connection. The NetHandle is ref-stable so the Pixi
 * ticker can poll it every frame without re-renders; roster/chat/status
 * go through React state for the DOM sidebar.
 */
export function useColyseusRoom(name: string, opts?: { hidden?: boolean; avatar?: AvatarConfig }) {
  const hidden = opts?.hidden === true;
  // Avatar inicial para las opciones del join (sin re-conectar cuando cambie;
  // los cambios viajan por sendAvatar).
  const avatarRef = React.useRef(opts?.avatar);
  avatarRef.current = opts?.avatar;
  const roomRef = React.useRef<Room<GameState> | null>(null);
  const [status, setStatus] = React.useState<NetStatus>("connecting");
  const [roster, setRoster] = React.useState<RosterEntry[]>([]);
  const [messages, setMessages] = React.useState<ChatEntry[]>([]);
  const [meetUrl, setMeetUrl] = React.useState<string>("");
  const [objects, setObjects] = React.useState<SmartObject[]>([]);
  const [net] = React.useState<NetHandle>(() =>
    DEMO
      ? {
          getRoom: () => null,
          sessionId: null,
          sendMove: () => undefined,
          sendAvatar: () => undefined,
          sendStatus: () => undefined,
          sendBoardScene: () => undefined,
          sendSetMeet: (url) => setMeetUrl(url),
          sendObjMove: (id, x, y) => setObjects((list) => list.map((o) => (o.id === id ? { ...o, x, y } : o))),
          sendObjAdd: (label, kind, x, y, w, h, radius, url, material, rotation) =>
            setObjects((list) => [
              ...list,
              {
                id: `demo-${Date.now().toString(36)}`,
                label,
                kind: kind as SmartObject["kind"],
                material: (material ?? "wood") as SmartObject["material"],
                x,
                y,
                w: w ?? 32,
                h: h ?? 32,
                radius: radius ?? 0,
                url: url ?? "",
                rotation: rotation ?? 0,
              },
            ]),
          sendObjRemove: (id) => setObjects((list) => list.filter((o) => o.id !== id)),
          sendObjRotate: (id, rotation) =>
            setObjects((list) => list.map((o) => (o.id === id ? { ...o, rotation } : o))),
          sendObjUpdate: (id, patch) =>
            setObjects((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o))),
        }
      : {
          getRoom: () => roomRef.current,
          sessionId: null,
          sendMove: (m) => roomRef.current?.send("move", m),
          sendAvatar: (cfg) => roomRef.current?.send("avatar", { ...cfg }),
          sendStatus: (status) => roomRef.current?.send("status", { status }),
          sendBoardScene: (boardId, elements) =>
            roomRef.current?.send("board-scene", { boardId, elements }),
          sendSetMeet: (url) => roomRef.current?.send("set-meet", { url }),
          sendObjMove: (id, x, y) => roomRef.current?.send("obj-move", { id, x, y }),
          sendObjAdd: (label, kind, x, y, w, h, radius, url, material, rotation) =>
            roomRef.current?.send("obj-add", { label, kind, x, y, w, h, radius, url, material, rotation }),
          sendObjRemove: (id) => roomRef.current?.send("obj-remove", { id }),
          sendObjRotate: (id, rotation) => roomRef.current?.send("obj-rotate", { id, rotation }),
          sendObjUpdate: (id, patch) => roomRef.current?.send("obj-update", { id, ...patch }),
        },
  );

  const syncObjects = React.useCallback((room: Room<GameState> | null) => {
    if (!room) return;
    const list: SmartObject[] = [];
    const validKinds: SmartObject["kind"][] = [
      "meet",
      "board",
      "generic",
      "wall",
      "window",
      "door",
    ];
    const validMaterials: SmartObject["material"][] = [
      "wood",
      "metal",
      "glass",
      "stone",
    ];
    room.state.objects.forEach((o) => {
      const kind: SmartObject["kind"] = (validKinds as readonly string[]).includes(
        o.kind,
      )
        ? (o.kind as SmartObject["kind"])
        : "generic";
      const material: SmartObject["material"] = (validMaterials as readonly string[]).includes(
        o.material,
      )
        ? (o.material as SmartObject["material"])
        : "wood";
      list.push({
        id: o.id,
        label: o.label,
        kind,
        material,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        radius: o.radius,
        url: o.url,
        rotation: typeof o.rotation === "number" ? o.rotation : 0,
      });
    });
    list.sort((a, b) => a.id.localeCompare(b.id));
    setObjects(list);
  }, []);

  React.useEffect(() => {
    if (!DEMO) return;
    let cancelled = false;
    setStatus("demo");
    setRoster([{ id: "self", name, self: true }]);
    const base = import.meta.env.BASE_URL;
    Promise.all(
      ["objects.json", "walls.json"].map((f) =>
        fetch(`${base}${f}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ),
    ).then(([objs, walls]) => {
      if (cancelled) return;
      const list = [...(objs as SmartObject[]), ...(walls as SmartObject[])].map((o) => ({
        ...o,
        material: o.material ?? "wood",
        rotation: o.rotation ?? 0,
      }));
      setObjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  React.useEffect(() => {
    if (DEMO) return;
    let cancelled = false;
    let room: Room<GameState> | null = null;
    setStatus("connecting");
    setRoster([]);
    (async () => {
      const base = hidden ? { name, hidden: true } : { name };
      const initial = !hidden && avatarRef.current ? { avatar: { ...avatarRef.current } } : {};
      room = await new Client(URL).joinOrCreate<GameState>("game", { ...base, ...initial });
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
      // Chat efímero: solo lo reciben los conectados; no hay historial para quien llega tarde.
      room.onMessage("chat", (m: { name: string; text: string; ts: number }) => {
        setMessages((prev) => [...prev.slice(-49), { name: m.name, text: m.text, ts: m.ts }]);
      });
      $(room.state).listen("meetUrl", (value: string) => setMeetUrl(value));
      $(room.state).objects.onAdd(() => syncObjects(room));
      $(room.state).objects.onRemove(() => syncObjects(room));
      // Propiedades de un objeto existente cambian (p.ej. rotation en obj-rotate).
      $(room.state).objects.onChange(() => syncObjects(room));
      syncObjects(room);
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
  }, [name, net, hidden]);

  const sendChat = React.useCallback(
    (text: string) => {
      if (DEMO) {
        setMessages((prev) => [...prev.slice(-49), { name, text, ts: Date.now() }]);
        return;
      }
      roomRef.current?.send("chat", { text });
    },
    [name],
  );

  return { status, roster, messages, sendChat, net, meetUrl, objects };
}
