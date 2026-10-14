import { describe, expect, it } from "vitest";
import { GameState, Player } from "@quiiven/protocol";

describe("GameRoom state (fase 0)", () => {
  it("crea jugador con spawn", () => {
    const s = new GameState();
    const p = new Player();
    p.x = 1;
    p.y = 2;
    s.players.set("a", p);
    expect(s.players.get("a")?.x).toBe(1);
  });
});
