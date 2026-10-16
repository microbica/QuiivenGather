import React from "react";
import { getEvents, type CalendarEvent } from "../api/google";

/** Re-fetch por si llegan reuniones nuevas. */
const REFRESH_MS = 30 * 60_000;

/**
 * Eventos del calendario a nivel de app: se piden al entrar y cada 30 min,
 * con el panel "Mi día" abierto o no (los avisos y la TV los necesitan).
 * Sin vincular (401) o sin servidor, devuelve [] sin romper nada.
 */
export function useCalendarEvents() {
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [syncing, setSyncing] = React.useState(false);
  const [lastSyncAt, setLastSyncAt] = React.useState<number | null>(null);

  const refresh = React.useCallback(async () => {
    setSyncing(true);
    try {
      setEvents(await getEvents());
      setLastSyncAt(Date.now()); // solo cuenta si Google respondió
    } catch {
      setEvents([]);
    } finally {
      setSyncing(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return { events, refreshEvents: refresh, syncing, lastSyncAt };
}
