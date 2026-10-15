import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  destroySession,
  linkColyseus,
  linkedSub,
  sessionSub,
  unlinkColyseus,
} from "./sessions.js";
import { saveTokens, getTokens, deleteTokens, setTestTokenFile } from "./store.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "gq-token-"));
  setTestTokenFile(join(dir, "google-tokens.json"));
  process.env.GOOGLE_TOKEN_KEY =
    "a".repeat(32) + "b".repeat(32); // 64 hex chars
});

afterAll(() => {
  setTestTokenFile("");
  rmSync(dir, { recursive: true, force: true });
});

const COOKIE = "gq_session";

describe("sessions (in-memory link + cookie)", () => {
  it("links cookie to google sub and reads it back", () => {
    const id = createSession("sub-1");
    const cookie = `${COOKIE}=${id}`;
    expect(sessionSub(cookie)).toBe("sub-1");
    expect(sessionSub("other=x")).toBeNull();
  });

  it("destroy clears session", () => {
    const id = createSession("sub-2");
    const cookie = `${COOKIE}=${id}`;
    expect(destroySession(cookie)).toBe("sub-2");
    expect(sessionSub(cookie)).toBeNull();
  });

  it("links colyseus sessionId to google sub", () => {
    linkColyseus("cid-9", "sub-9");
    expect(linkedSub("cid-9")).toBe("sub-9");
    unlinkColyseus("cid-9");
    expect(linkedSub("cid-9")).toBeNull();
  });
});

describe("token store (AES-GCM round-trip)", () => {
  it("saves and reads tokens, keeps refresh", () => {
    saveTokens(
      "sub-3",
      { email: "a@b.com", name: "A" },
      {
        access_token: "ACCESS",
        refresh_token: "REFRESH",
        expires_at: Date.now() + 3600_000,
      },
    );
    const t = getTokens("sub-3");
    expect(t?.accessToken).toBe("ACCESS");
    expect(t?.refreshToken).toBe("REFRESH");
    expect(t?.email).toBe("a@b.com");
  });

  it("returns null for unknown sub", () => {
    expect(getTokens("nope")).toBeNull();
  });

  it("deletes tokens", () => {
    saveTokens("sub-4", { email: "c@d.com", name: "C" }, {
      access_token: "x",
      refresh_token: "r",
      expires_at: Date.now(),
    });
    deleteTokens("sub-4");
    expect(getTokens("sub-4")).toBeNull();
  });
});
