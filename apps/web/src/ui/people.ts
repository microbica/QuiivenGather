// Brand area colors used to tell people apart (manual Quiiven 2026).
const AREA_COLORS = ["#FFAE00", "#18D3B8", "#349CE2", "#FF7442", "#F4C567", "#0EAD9A"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function personColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AREA_COLORS[h % AREA_COLORS.length];
}
