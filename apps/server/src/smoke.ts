// Fase 2 smoke: 2 clientes reales contra el server en local.
// Uso: (server corriendo) pnpm --filter @quiiven/server smoke
// Verifica: join/spawn, broadcast move <3s, anti-teleport, chat global.
import { Client, getStateCallbacks } from "colyseus.js";
import type { GameState } from "@quiiven/protocol";

const URL = process.env.SMOKE_URL ?? "ws://localhost:2567";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${what}`);
    await sleep(50);
  }
}

async function main(): Promise<void> {
  const roomA = await new Client(URL).joinOrCreate<GameState>("game", {
    name: "smoke-a",
  });
  const roomB = await new Client(URL).joinOrCreate<GameState>("game", {
    name: "smoke-b",
  });
  const idA = roomA.sessionId;

  // B ve a A (spawn broadcast).
  await waitFor(
    () => roomB.state.players?.get(idA) !== undefined,
    3000,
    "B sees A join",
  );
  console.log("ok: join/spawn broadcast");

  // A se mueve 50px (dentro del radio permitido con dt≈300ms); B lo ve exacto.
  await sleep(300);
  const ax0 = roomB.state.players.get(idA)?.x as number;
  const ay0 = roomB.state.players.get(idA)?.y as number;
  const tx = ax0 + 40;
  const ty = ay0 + 30;
  roomA.send("move", { x: tx, y: ty, dir: "right", anim: "walk" });
  await waitFor(
    () =>
      roomB.state.players.get(idA)?.x === tx &&
      roomB.state.players.get(idA)?.y === ty,
    3000,
    "move broadcast",
  );
  console.log("ok: move broadcast");

  // Reporte de zona: el server guarda y difunde el zoneId del cliente.
  roomA.send("move", { x: tx, y: ty, dir: "down", anim: "idle", zone: "sala-1" });
  await waitFor(
    () => roomB.state.players.get(idA)?.zoneId === "sala-1",
    3000,
    "zone broadcast",
  );
  console.log("ok: zone broadcast");

  // Anti-teleport: salto imposible se recorta, no se aplica tal cual.
  roomA.send("move", { x: 50, y: 50, dir: "up", anim: "walk" });
  await sleep(400);
  const px = roomB.state.players.get(idA)?.x as number;
  const py = roomB.state.players.get(idA)?.y as number;
  const dist = Math.hypot(px - tx, py - ty);
  if (dist > 200) throw new Error(`teleport no recortado: (${px},${py})`);
  console.log(`ok: anti-teleport (dist=${Math.round(dist)}px)`);

  // Chat global: B recibe lo de A (callbacks vía proxy v3).
  let got: string | null = null;
  getStateCallbacks(roomB)(roomB.state).messages.onAdd((m) => {
    got = m.text;
  });
  roomA.send("chat", { text: "hola fase2" });
  await waitFor(() => got === "hola fase2", 3000, "chat global");
  console.log("ok: chat global");

  // Relay rtc-signal: B recibe la oferta de A; destino inexistente se ignora.
  let signal: { from?: string; kind?: string } | null = null;
  roomB.onMessage("rtc-signal", (msg: { from?: string; kind?: string }) => {
    signal = msg;
  });
  roomA.send("rtc-signal", { to: roomB.sessionId, kind: "offer", sdp: "fake-sdp" });
  await waitFor(
    () => signal?.kind === "offer" && signal?.from === idA,
    3000,
    "rtc relay",
  );
  console.log("ok: rtc relay");
  roomA.send("rtc-signal", { to: "no-existe", kind: "offer", sdp: "x" });
  await sleep(200); // no debe crashear ni reenviar

  await roomA.leave();
  await roomB.leave();
  console.log("SMOKE PASS");
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
