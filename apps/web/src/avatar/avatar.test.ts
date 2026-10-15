import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, randomAvatar, sanitizeAvatar, type AvatarConfig } from "./config";
import { AVATAR_H, AVATAR_W, paintAvatar } from "./render";

const firstOpaqueRow = (cfg: AvatarConfig) => {
  const g = paintAvatar(cfg);
  return Math.floor(g.px.findIndex((p) => p !== "") / g.w);
};

describe("avatar config", () => {
  it("sanitizes unknown or malicious input to safe values", () => {
    const cfg = sanitizeAvatar({ hair: "<script>", skin: "red", top: "vestido", extra: 1 });
    expect(cfg.hair).toBe(DEFAULT_AVATAR.hair);
    expect(cfg.skin).toBe(DEFAULT_AVATAR.skin);
    expect(cfg.top).toBe("vestido");
    expect(Object.keys(cfg)).not.toContain("extra");
  });

  it("gives the same avatar for the same seed", () => {
    expect(randomAvatar("Valentina Uribe")).toEqual(randomAvatar("Valentina Uribe"));
  });
});

describe("avatar painter", () => {
  it("paints a fixed-size grid with a Carbón outline", () => {
    const g = paintAvatar(DEFAULT_AVATAR);
    expect(g.w).toBe(AVATAR_W);
    expect(g.h).toBe(AVATAR_H);
    expect(g.px).toContain("#2c2c33");
  });

  it("taller avatars reach higher", () => {
    expect(firstOpaqueRow({ ...DEFAULT_AVATAR, height: "alta" })).toBeLessThan(
      firstOpaqueRow({ ...DEFAULT_AVATAR, height: "baja" }),
    );
  });

  it("a bald avatar shows no hair color", () => {
    const hairColor = "#e66fa6";
    const g = paintAvatar({ ...DEFAULT_AVATAR, hair: "calvo", hairColor, facialHair: "ninguna" });
    expect(g.px).not.toContain(hairColor);
  });

  it("walking lifts a foot", () => {
    expect(paintAvatar(DEFAULT_AVATAR, "front", 1).px).not.toEqual(paintAvatar(DEFAULT_AVATAR).px);
  });
});
