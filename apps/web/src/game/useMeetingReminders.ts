import React from "react";
import type { CalendarEvent } from "../api/google";
import {
  DATE_ONLY,
  formatRange,
  isExpired,
  isLive,
} from "../calendar/eventTime";

const MIN = 60_000;
const TICK_MS = 30_000;
const MAX_TOASTS = 5;

export type ReminderKind = "m15" | "m5" | "now";

export interface ReminderToast {
  key: string;
  eventId: string;
  kind: ReminderKind;
  title: string;
  when: string;
  url: string;
  isMeet: boolean;
}

export type NotifyPermission = NotificationPermission | "unsupported";

/**
 * Aviso pendiente más urgente de un evento (pura, testeada):
 * - "now" si está en curso, "m5"/"m15" al cruzar cada umbral previo.
 * - Los todo-el-día nunca avisan (solo se ven en la lista).
 * - Lo vencido o sin fecha válida nunca avisa.
 */
export function dueReminder(
  e: CalendarEvent,
  now: number,
  fired: ReadonlySet<string>,
): ReminderKind | null {
  if (isExpired(e, now)) return null;
  if (DATE_ONLY.test(e.start)) return null; // todo-el-día: solo lista, sin aviso ni sonido
  const key = (k: ReminderKind) => `${e.id}:${k}`;
  const s = Date.parse(e.start);
  if (Number.isNaN(s)) return null;
  if (isLive(e, now)) return fired.has(key("now")) ? null : "now";
  const ms = s - now;
  if (ms <= 5 * MIN) return fired.has(key("m5")) ? null : "m5";
  if (ms <= 15 * MIN) return fired.has(key("m15")) ? null : "m15";
  return null;
}

/** Beep corto de dos tonos (WebAudio). Silencioso si el navegador lo bloquea. */
function playReminderSound(): void {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const run = () => {
      try {
        [880, 660].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          const t0 = ctx.currentTime + i * 0.22;
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
          osc.start(t0);
          osc.stop(t0 + 0.2);
        });
        setTimeout(() => ctx.close().catch(() => undefined), 900);
      } catch {
        /* ignore */
      }
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(run).catch(() => undefined);
    } else {
      run();
    }
  } catch {
    /* audio no disponible */
  }
}

function reminderLabel(kind: ReminderKind): string {
  if (kind === "now") return "Es ahora";
  if (kind === "m5") return "Empieza en 5 min";
  return "Empieza en 15 min";
}

function notifyNative(r: ReminderToast): void {
  try {
    const n = new Notification(`${r.title} · ${reminderLabel(r.kind)}`, {
      body: r.when,
      tag: r.key,
    });
    n.onclick = () => {
      window.focus();
      if (r.url) window.open(r.url, "_blank", "noopener");
      n.close();
    };
  } catch {
    /* permiso revocado o navegador sin soporte */
  }
}

/**
 * Avisos de reunión: 15 min antes, 5 min antes y al empezar.
 * Revisa cada 30 s, dispara una vez por evento y muestra toast en la app;
 * además manda Notification nativa si el usuario la activó en "Mi día".
 */
export function useMeetingReminders(events: CalendarEvent[]) {
  const [toasts, setToasts] = React.useState<ReminderToast[]>([]);
  const [permission, setPermission] = React.useState<NotifyPermission>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [now, setNow] = React.useState(() => Date.now());
  const firedRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const requestPermission = React.useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      /* el navegador no lo permite aquí */
    }
  }, []);

  const dismiss = React.useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  // Solo lo vigente: ni el calendario ni la TV ofrecen meets vencidos.
  const upcoming = React.useMemo(
    () => events.filter((e) => !isExpired(e, now)),
    [events, now],
  );

  React.useEffect(() => {
    const fresh: ReminderToast[] = [];
    for (const e of upcoming) {
      const kind = dueReminder(e, now, firedRef.current);
      if (!kind) continue;
      firedRef.current.add(`${e.id}:${kind}`);
      fresh.push({
        key: `${e.id}:${kind}`,
        eventId: e.id,
        kind,
        title: e.summary || "(Sin título)",
        when: formatRange(e),
        url: e.hangoutLink || e.htmlLink,
        isMeet: e.hangoutLink !== "",
      });
    }
    if (fresh.length === 0) return;
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_TOASTS));
    playReminderSound();
    if (permission === "granted") {
      for (const r of fresh) notifyNative(r);
    }
  }, [upcoming, now, permission]);

  return { now, upcoming, toasts, dismiss, permission, requestPermission };
}
