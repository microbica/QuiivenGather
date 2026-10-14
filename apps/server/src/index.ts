import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom.js";

const PORT = Number(process.env.SERVER_PORT ?? 2567);
const CORS_ORIGIN = process.env.SERVER_CORS_ORIGIN ?? "http://localhost:5173";
const PATCH_RATE = Number(process.env.GAME_PATCH_RATE ?? 50);
const MAX_CLIENTS = Number(process.env.GAME_MAX_CLIENTS ?? 50);

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.get("/health", (_req, res) => {
  res.json({ ok: true, phase: 0, room: "game", patchRate: PATCH_RATE, maxClients: MAX_CLIENTS });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);

httpServer.listen(PORT, () => {
  console.log(`[server] Fase 0 listening on :${PORT} (cors: ${CORS_ORIGIN})`);
});
