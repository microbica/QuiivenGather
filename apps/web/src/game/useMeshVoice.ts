import React from "react";
import { MESH_MAX_PEERS } from "@quiiven/protocol";
import { MeshVoice } from "./mesh";
import { SpatialAudio } from "./spatialAudio";
import type { NetHandle } from "./useColyseus";

/**
 * Owns the P2P mesh lifecycle. Created lazily on user gesture (mic/cam +
 * AudioContext both require one). Peers are synced from the proximity list
 * by the App via syncPeers (capped at MESH_MAX_PEERS).
 */
export function useMeshVoice(net: NetHandle) {
  const [supported] = React.useState(
    () =>
      typeof RTCPeerConnection !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
  );
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mutedAudio, setMutedAudio] = React.useState(false);
  const [mutedVideo, setMutedVideo] = React.useState(false);
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = React.useState<
    ReadonlyMap<string, MediaStream>
  >(new Map());
  const audioRef = React.useRef<SpatialAudio | null>(null);
  if (!audioRef.current) audioRef.current = new SpatialAudio();
  const meshRef = React.useRef<MeshVoice | null>(null);
  // El micrófono se apaga por botón manual O por estado (focus/meeting/away).
  const micMuteRef = React.useRef({ manual: false, status: false });

  const start = React.useCallback(async () => {
    const room = net.getRoom();
    if (!room || meshRef.current) return;
    try {
      const stun = import.meta.env.VITE_STUN_URL ?? "stun:stun.l.google.com:19302";
      const mesh = new MeshVoice(room, [{ urls: stun }], {
        onRemoteStream: (id, stream) => {
          audioRef.current?.attach(id, stream);
          setRemoteStreams((prev) => new Map(prev).set(id, stream));
        },
        onPeerClosed: (id) => {
          audioRef.current?.detach(id);
          setRemoteStreams((prev) => {
            const m = new Map(prev);
            m.delete(id);
            return m;
          });
        },
      });
      meshRef.current = mesh;
      audioRef.current?.ensure();
      const stream = await mesh.enableLocal();
      setLocalStream(stream);
      setActive(true);
      setError(null);
    } catch (e) {
      meshRef.current = null;
      setError(e instanceof Error ? e.message : "mic/cam no disponible");
    }
  }, [net]);

  const stop = React.useCallback(() => {
    meshRef.current?.dispose();
    meshRef.current = null;
    audioRef.current?.detachAll();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setActive(false);
  }, []);

  const syncPeers = React.useCallback(
    (ids: string[]) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      // Room cambió (reconnect por cambio de nombre): soltar mesh vieja.
      if (mesh.boundRoom !== net.getRoom()) {
        stop();
        return;
      }
      mesh.sync(ids.slice(0, MESH_MAX_PEERS));
    },
    [net, stop],
  );

  const applyMicMute = React.useCallback(() => {
    meshRef.current?.setMuted("audio", micMuteRef.current.manual || micMuteRef.current.status);
  }, []);

  const toggleAudio = React.useCallback(() => {
    setMutedAudio((m) => {
      micMuteRef.current.manual = !m;
      applyMicMute();
      return !m;
    });
  }, [applyMicMute]);

  /** La App lo llama con el estado de presencia (focus/meeting/away → mic off). */
  const setStatusMuted = React.useCallback(
    (muted: boolean) => {
      micMuteRef.current.status = muted;
      applyMicMute();
    },
    [applyMicMute],
  );

  const toggleVideo = React.useCallback(() => {
    setMutedVideo((m) => {
      meshRef.current?.setMuted("video", !m);
      return !m;
    });
  }, []);

  React.useEffect(
    () => () => {
      meshRef.current?.dispose();
      meshRef.current = null;
    },
    [],
  );

  return {
    supported,
    active,
    error,
    localStream,
    remoteStreams,
    mutedAudio,
    mutedVideo,
    audio: audioRef.current,
    start,
    stop,
    syncPeers,
    toggleAudio,
    toggleVideo,
    setStatusMuted,
  };
}
