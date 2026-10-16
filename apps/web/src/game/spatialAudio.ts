// Spatial audio graph (Fase 3): one PannerNode per remote peer.
// equalpower + linear = cheap and predictable on 2D grids (no HRTF at scale).
// positionZ is always 0. Media still travels over UDP/WebRTC; only the
// *gain/pan* is computed here from avatar positions.

export class SpatialAudio {
  private ctx: AudioContext | null = null;
  private peers = new Map<
    string,
    { src: MediaStreamAudioSourceNode; panner: PannerNode; gain: GainNode }
  >();

  /** Must be called from a user gesture at least once. */
  ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  attach(id: string, stream: MediaStream): void {
    if (this.peers.has(id)) return;
    const ctx = this.ensure();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const src = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    const panner = ctx.createPanner();
    panner.panningModel = "equalpower";
    panner.distanceModel = "linear";
    panner.refDistance = 32;
    panner.rolloffFactor = 1;
    panner.positionZ.value = 0;
    const gain = ctx.createGain();
    src.connect(panner);
    panner.connect(gain);
    gain.connect(ctx.destination);
    this.peers.set(id, { src, panner, gain });
  }

  setPosition(id: string, dx: number, dy: number): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.panner.positionX.value = dx;
    p.panner.positionY.value = dy;
  }

  setRadius(radiusPx: number): void {
    for (const p of this.peers.values()) {
      p.panner.maxDistance = radiusPx;
      p.panner.refDistance = 32;
    }
  }

  /** Playback level per peer: 1 normal, 0.5 busy, 0 bloqueado por estado. */
  setLevel(id: string, level: number): void {
    const p = this.peers.get(id);
    if (p) p.gain.gain.value = level;
  }

  setMuted(id: string, muted: boolean): void {
    this.setLevel(id, muted ? 0 : 1);
  }

  detach(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    try {
      p.src.disconnect();
      p.panner.disconnect();
      p.gain.disconnect();
    } catch {
      /* already disconnected */
    }
    this.peers.delete(id);
  }

  detachAll(): void {
    for (const id of [...this.peers.keys()]) this.detach(id);
  }
}
