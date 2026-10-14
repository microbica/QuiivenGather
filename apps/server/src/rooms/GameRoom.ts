import { Room, Client } from "colyseus";
import { GameState, Player } from "@quiiven/protocol";

/** Fase 0: room mínimo que arranca. Movimiento real en Fase 2. */
export class GameRoom extends Room<GameState> {
  maxClients = 50;

  onCreate() {
    this.setState(new GameState());
    const rate = Number(process.env.GAME_PATCH_RATE ?? 50);
    this.setPatchRate(rate);
    this.onMessage("ping", (client) => {
      client.send("pong", { t: Date.now() });
    });
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const p = new Player();
    p.name = String(options.name ?? `guest-${client.sessionId.slice(0, 4)}`);
    p.x = 100 + Math.random() * 200;
    p.y = 100 + Math.random() * 200;
    this.state.players.set(client.sessionId, p);
    console.log(`[game] join ${client.sessionId} as ${p.name}`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`[game] leave ${client.sessionId}`);
  }
}
