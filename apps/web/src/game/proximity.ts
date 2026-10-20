// Pure proximity rules (Fase 2.5 mock, no WebRTC).
// - Open area: radial euclidean rule within radiusPx.
// - Private zone: isolates. Anyone inside a private zone connects ONLY to
//   peers in the SAME zone; radial is suppressed for them entirely.

export interface PeerZone {
  zoneId: string;
  zoneKind: string; // "private" | "interact" | ""
  /** Locked conversation ("bubble") id; "" = none. */
  bubble?: string;
}

export function distancePx(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function privateId(z: PeerZone): string {
  return z.zoneKind === "private" ? z.zoneId : "";
}

export function isConnected(
  self: PeerZone,
  peer: PeerZone,
  distPx: number,
  radiusPx: number,
): boolean {
  // A locked conversation wins over everything: only its members hear each other.
  if (self.bubble || peer.bubble) return !!self.bubble && self.bubble === peer.bubble;
  const selfPriv = privateId(self);
  const peerPriv = privateId(peer);
  if (selfPriv || peerPriv) return selfPriv !== "" && selfPriv === peerPriv;
  return distPx <= radiusPx;
}
