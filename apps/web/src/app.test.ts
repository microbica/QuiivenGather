import { describe, expect, it } from "vitest";

describe("fase0", () => {
  it("env documentado", () => {
    expect("VITE_COLYSEUS_URL").toBeTruthy();
  });
});
