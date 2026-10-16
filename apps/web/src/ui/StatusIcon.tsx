import type { ReactNode } from "react";
import type { PresenceStatus } from "../game/status";

/**
 * Status glyphs in the app's icon style (stroke SVG, currentColor —
 * same language as the calendar bell). No emoji, no text glyphs.
 */
function pathsFor(id: PresenceStatus): ReactNode[] {
  switch (id) {
    case "available":
      return [
        <path key="c" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />,
        <path key="k" d="M22 4L12 14.01l-3-3" />,
      ];
    case "meeting":
      return [
        <polygon key="v" points="23 7 16 12 23 17 23 7" />,
        <rect key="r" x="1" y="5" width="15" height="14" rx="2" />,
      ];
    case "busy":
      return [
        <circle key="c" cx="12" cy="12" r="10" />,
        <path key="p1" d="M10 9v6" />,
        <path key="p2" d="M14 9v6" />,
      ];
    case "focus":
      return [
        <circle key="c" cx="12" cy="12" r="10" />,
        <path key="m" d="M8 12h8" />,
      ];
    case "away":
      return [<path key="m" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />];
  }
}

export function StatusIcon({ id, size = 14 }: { id: PresenceStatus; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {pathsFor(id)}
    </svg>
  );
}
