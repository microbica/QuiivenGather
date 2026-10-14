// P2P mesh voice (Fase 3, 100% open-source, no SFU).
// - Signaling (offer/answer/ice) travels over Colyseus (TCP): deterministic
//   metadata, which is the correct transport for it.
// - Media travels peer-to-peer over UDP/SRTP via RTCPeerConnection.
// - Glare avoidance: the peer with the LOWER sessionId always initiates,
//   so two browsers never offer each other simultaneously.
import type { Room } from "colyseus.js";
import type { GameState } from "@quiiven/protocol";

export interface SignalIn {
  from: string;
  kind: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface MeshEvents {
  onRemoteStream(id: string, stream: MediaStream): void;
  onPeerClosed(id: string): void;
}

export class MeshVoice {
  private pcs = new Map<string, RTCPeerConnection>();
  private local: MediaStream | null = null;

  constructor(
    private room: Room<GameState>,
    private iceServers: RTCIceServer[],
    private events: MeshEvents,
  ) {
    room.onMessage("rtc-signal", (msg: SignalIn) => {
      void this.handleSignal(msg);
    });
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  get boundRoom(): Room<GameState> {
    return this.room;
  }

  async enableLocal(): Promise<MediaStream> {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 320 }, height: { ideal: 240 } },
    });
    return this.local;
  }

  get localStream(): MediaStream | null {
    return this.local;
  }

  peerCount(): number {
    return this.pcs.size;
  }

  private makePC(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.local?.getTracks().forEach((t) => {
      if (this.local) pc.addTrack(t, this.local);
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.room.send("rtc-signal", {
          to: peerId,
          kind: "ice",
          candidate: e.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream) this.events.onRemoteStream(peerId, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.disconnectFrom(peerId);
      }
    };
    return pc;
  }

  async connectTo(peerId: string): Promise<void> {
    if (this.pcs.has(peerId) || !this.local || peerId === this.room.sessionId) return;
    const pc = this.makePC(peerId);
    this.pcs.set(peerId, pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.room.send("rtc-signal", {
      to: peerId,
      kind: "offer",
      sdp: pc.localDescription?.toJSON(),
    });
  }

  private async handleSignal(msg: SignalIn): Promise<void> {
    const { from, kind } = msg;
    if (!from || from === this.room.sessionId) return;
    if (kind === "offer" && msg.sdp) {
      const old = this.pcs.get(from);
      if (old) old.close();
      const pc = this.makePC(from);
      this.pcs.set(from, pc);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.room.send("rtc-signal", {
        to: from,
        kind: "answer",
        sdp: pc.localDescription?.toJSON(),
      });
    } else if (kind === "answer") {
      const pc = this.pcs.get(from);
      if (pc && pc.signalingState !== "stable" && msg.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      }
    } else if (kind === "ice") {
      const pc = this.pcs.get(from);
      if (pc && msg.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          /* late candidate, ignore */
        }
      }
    }
  }

  disconnectFrom(peerId: string): void {
    const pc = this.pcs.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* already closed */
      }
      this.pcs.delete(peerId);
    }
    this.events.onPeerClosed(peerId);
  }

  /** Connect to wanted peers (that we should initiate to), drop the rest. */
  sync(targetIds: string[]): void {
    const want = new Set(targetIds.filter((id) => id !== this.room.sessionId));
    for (const id of want) {
      if (!this.pcs.has(id) && this.room.sessionId < id) {
        void this.connectTo(id);
      }
    }
    for (const id of [...this.pcs.keys()]) {
      if (!want.has(id)) this.disconnectFrom(id);
    }
  }

  setMuted(kind: "audio" | "video", muted: boolean): void {
    this.local?.getTracks().forEach((t) => {
      if ((t.kind === "audio") === (kind === "audio")) t.enabled = !muted;
    });
  }

  dispose(): void {
    for (const id of [...this.pcs.keys()]) this.disconnectFrom(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }
}
