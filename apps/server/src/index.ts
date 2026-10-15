import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
// Monorepo: el .env real vive en la raíz. Carga el de cwd y, si no, el de la raíz.
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom.js";
import { googleRouter } from "./auth/routes.js";

const PORT = Number(process.env.SERVER_PORT ?? 2567);
const CORS_ORIGIN = process.env.SERVER_CORS_ORIGIN ?? "http://localhost:5173";
const PATCH_RATE = Number(process.env.GAME_PATCH_RATE ?? 50);
const MAX_CLIENTS = Number(process.env.GAME_MAX_CLIENTS ?? 50);

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.get("/health", (_req, res) => {
  res.json({ ok: true, phase: 0, room: "game", patchRate: PATCH_RATE, maxClients: MAX_CLIENTS });
});
app.use(googleRouter());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);

process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException:", err);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`[server] Fase 0 listening on :${PORT} (cors: ${CORS_ORIGIN})`);
});
