import React from "react";
import { Client, getStateCallbacks } from "colyseus.js";
import type { Room } from "colyseus.js";
import type { GameState } from "@quiiven/protocol";
import type { AvatarConfig } from "../avatar/config";
import type { PresenceStatus } from "./status";
import type { SmartObject } from "./objects";
import { loadDesk, saveDesk, type DeskCustom } from "../avatar/desk";

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

/** Private 1:1 message (ephemeral, like the general chat). */
export interface DmEntry {
  /** Session id of the other person. */
  peer: string;
  peerName: string;
  text: string;
  ts: number;
  mine: boolean;
}

/** Someone knocking on a closed room you are in. */
export interface KnockEntry {
  zone: string;
  from: string;
  name: string;
  ts: number;
}

/** One-off room events for the UI (let in / door closed). */
export interface RoomEvent {
  type: "admitted" | "locked";
  zone: string;
  by: string;
  ts: number;
}

/** A claimed desk as seen by everybody. `config` is the raw decoration. */
export interface DeskClaimView {
  deskId: number;
  owner: string;
  ownerKey: string;
  config: Record<string, unknown>;
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
  /** Close (or open) a meeting room you are in. */
  sendRoomLock(zone: string, locked: boolean): void;
  /** Knock on a closed room: the people inside get a "let in" prompt. */
  sendKnock(zone: string): void;
  sendAdmit(zone: string, to: string): void;
  /** Fixed Meet link of the room you are in ("" removes it). */
  sendRoomMeet(zone: string, url: string): void;
  sendDm(to: string, text: string): void;
  /** Make a desk yours (frees your previous one) with its decoration. */
  sendDeskClaim(deskId: number, config: object): void;
  sendDeskUpdate(config: object): void;
  /** Free your desk (or, as admin, someone else's by id). */
  sendDeskRelease(deskId?: number): void;
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

/** Preview-only colleague so private chats can be tried without a server. */
export const DEMO_BOT = { id: "demo-bot", name: "Quiivi (prueba)" };

const DEMO_KEY = "me";
/** Preview: a desk in Talento Humano already taken by the test colleague. */
const DEMO_DESK: DeskClaimView = {
  deskId: 101854,
  owner: DEMO_BOT.name,
  ownerKey: "bot",
  config: { material: "verde", setup: "laptop", chairStyle: "gamer", chairColor: "#18d3b8", left: "tocadiscos", right: "cafe-llevar", floor: "palma" },
};

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
  const [locks, setLocks] = React.useState<Record<string, string>>({});
  const [roomMeets, setRoomMeets] = React.useState<Record<string, string>>({});
  const [dms, setDms] = React.useState<DmEntry[]>([]);
  const [knocks, setKnocks] = React.useState<KnockEntry[]>([]);
  const [roomEvent, setRoomEvent] = React.useState<RoomEvent | null>(null);
  const [desks, setDesks] = React.useState<Record<number, DeskClaimView>>(() => {
    if (!DEMO) return {};
    // Preview: your saved desk + one owned by the test colleague.
    const m: Record<number, DeskClaimView> = { [DEMO_DESK.deskId]: DEMO_DESK };
    const mine = loadDesk();
    if (mine && mine.deskId !== DEMO_DESK.deskId) m[mine.deskId] = { deskId: mine.deskId, owner: name, ownerKey: DEMO_KEY, config: { ...mine } };
    return m;
  });
  const [myKey, setMyKey] = React.useState(DEMO ? DEMO_KEY : "");
  const [deskEvent, setDeskEvent] = React.useState<{ deskId: number; owner: string; ts: number } | null>(null);
  const addDm = React.useCallback((d: DmEntry) => setDms((prev) => [...prev.slice(-199), d]), []);
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
          sendRoomLock: (zone, locked) =>
            setLocks((m) => {
              const n = { ...m };
              if (locked) n[zone] = name;
              else delete n[zone];
              return n;
            }),
          sendKnock: () => undefined,
          sendAdmit: () => undefined,
          sendRoomMeet: (zone, url) =>
            setRoomMeets((m) => {
              const n = { ...m };
              if (url) n[zone] = url;
              else delete n[zone];
              return n;
            }),
          sendDeskClaim: (deskId, config) =>
            setDesks((m) => {
              if (m[deskId] && m[deskId].ownerKey !== DEMO_KEY) {
                setDeskEvent({ deskId, owner: m[deskId].owner, ts: Date.now() });
                return m;
              }
              const n: Record<number, DeskClaimView> = {};
              for (const d of Object.values(m)) if (d.ownerKey !== DEMO_KEY) n[d.deskId] = d;
              n[deskId] = { deskId, owner: name, ownerKey: DEMO_KEY, config: { ...config } };
              saveDesk({ ...(config as DeskCustom), deskId });
              return n;
            }),
          sendDeskUpdate: (config) =>
            setDesks((m) => {
              const mine = Object.values(m).find((d) => d.ownerKey === DEMO_KEY);
              if (!mine) return m;
              saveDesk({ ...(config as DeskCustom), deskId: mine.deskId });
              return { ...m, [mine.deskId]: { ...mine, config: { ...config } } };
            }),
          sendDeskRelease: () =>
            setDesks((m) => {
              saveDesk(null);
              const n: Record<number, DeskClaimView> = {};
              for (const d of Object.values(m)) if (d.ownerKey !== DEMO_KEY) n[d.deskId] = d;
              return n;
            }),
          // Preview: a test colleague answers so the private chat can be tried.
          sendDm: (to, text) => {
            const peerName = to === DEMO_BOT.id ? DEMO_BOT.name : to;
            addDm({ peer: to, peerName, text, ts: Date.now(), mine: true });
            if (to === DEMO_BOT.id)
              window.setTimeout(
                () => addDm({ peer: to, peerName, text: "¡Hola! 👋 Soy un compañero de prueba: en la oficina real este mensaje solo lo ves tú y la persona a la que le escribes.", ts: Date.now(), mine: false }),
                900,
              );
          },
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
          sendRoomLock: (zone, locked) => roomRef.current?.send("room-lock", { zone, locked }),
          sendKnock: (zone) => roomRef.current?.send("room-knock", { zone }),
          sendAdmit: (zone, to) => roomRef.current?.send("room-admit", { zone, to }),
          sendRoomMeet: (zone, url) => roomRef.current?.send("room-meet", { zone, url }),
          sendDm: (to, text) => roomRef.current?.send("dm", { to, text }),
          sendDeskClaim: (deskId, config) => roomRef.current?.send("desk-claim", { deskId, config }),
          sendDeskUpdate: (config) => roomRef.current?.send("desk-update", { config }),
          sendDeskRelease: (deskId) => roomRef.current?.send("desk-release", deskId === undefined ? {} : { deskId }),
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
    setRoster([{ id: "self", name, self: true }, { id: DEMO_BOT.id, name: DEMO_BOT.name, self: false }]);
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
      // Closed rooms and per-room Meet links.
      const syncLocks = () => {
        const m: Record<string, string> = {};
        room?.state.locks.forEach((by, zone) => (m[zone] = by));
        setLocks(m);
      };
      const syncRoomMeets = () => {
        const m: Record<string, string> = {};
        room?.state.roomMeets.forEach((url, zone) => (m[zone] = url));
        setRoomMeets(m);
      };
      $(room.state).locks.onAdd(syncLocks);
      $(room.state).locks.onRemove(syncLocks);
      $(room.state).roomMeets.onAdd(syncRoomMeets);
      $(room.state).roomMeets.onRemove(syncRoomMeets);
      $(room.state).roomMeets.onChange(syncRoomMeets);
      syncLocks();
      syncRoomMeets();
      // Claimed desks (everybody's) and who "me" is.
      const syncDesks = () => {
        const m: Record<number, DeskClaimView> = {};
        room?.state.desks.forEach((d) => {
          let config: Record<string, unknown> = {};
          try {
            config = JSON.parse(d.config || "{}");
          } catch {
            /* keep empty */
          }
          m[d.deskId] = { deskId: d.deskId, owner: d.owner, ownerKey: d.ownerKey, config };
        });
        setDesks(m);
      };
      $(room.state).desks.onAdd((d) => {
        syncDesks();
        $(d).onChange(syncDesks);
      });
      $(room.state).desks.onRemove(syncDesks);
      syncDesks();
      const syncMe = () => setMyKey(room?.state.players.get(room.sessionId)?.key ?? "");
      $(room.state).players.onAdd(syncMe);
      syncMe();
      room.onMessage("desk-taken", (m: { deskId: number; owner: string }) =>
        setDeskEvent({ deskId: m.deskId, owner: m.owner, ts: Date.now() }),
      );
      const nameOf = (id: string) => room?.state.players.get(id)?.name ?? "Alguien";
      room.onMessage("dm", (m: { from: string; name: string; text: string; ts: number }) =>
        addDm({ peer: m.from, peerName: m.name, text: m.text, ts: m.ts, mine: false }),
      );
      room.onMessage("dm-sent", (m: { to: string; text: string; ts: number }) =>
        addDm({ peer: m.to, peerName: nameOf(m.to), text: m.text, ts: m.ts, mine: true }),
      );
      room.onMessage("room-knock", (k: KnockEntry) =>
        setKnocks((prev) => [...prev.filter((x) => !(x.from === k.from && x.zone === k.zone)), k]),
      );
      room.onMessage("room-admitted", (m: { zone: string; by: string }) =>
        setRoomEvent({ type: "admitted", zone: m.zone, by: m.by, ts: Date.now() }),
      );
      room.onMessage("room-locked", (m: { zone: string; by?: string }) =>
        setRoomEvent({ type: "locked", zone: m.zone, by: m.by ?? "", ts: Date.now() }),
      );
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

  const dismissKnock = React.useCallback(
    (k: KnockEntry) => setKnocks((prev) => prev.filter((x) => x !== k)),
    [],
  );

  return { status, roster, messages, sendChat, net, meetUrl, objects, locks, roomMeets, dms, knocks, dismissKnock, roomEvent, desks, myKey, deskEvent };
}
