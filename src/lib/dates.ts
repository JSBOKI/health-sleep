const TOKYO_MS = 9 * 60 * 60 * 1000;

export interface TokyoParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

export function tokyoParts(ms: number): TokyoParts {
  const t = new Date(ms + TOKYO_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
    ss: t.getUTCSeconds(),
  };
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function dateKeyFromMs(ms: number): string {
  const p = tokyoParts(ms);
  return ymd(p.y, p.m, p.d);
}

/** Nights belong to the evening they start. Times before noon stay with the previous evening. */
export function nightKeyFromMs(ms: number): string {
  const p = tokyoParts(ms);
  const date = ymd(p.y, p.m, p.d);
  return p.hh < 12 ? addDays(date, -1) : date;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86400000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetween(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const a = Date.UTC(ys, (ms ?? 1) - 1, ds ?? 1);
  const b = Date.UTC(ye, (me ?? 1) - 1, de ?? 1);
  return Math.round((b - a) / 86400000);
}

export function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function eachDate(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** Wall-clock time in Asia/Tokyo as epoch ms. Tokyo has no daylight saving. */
export function tokyoWallMs(date: string, hh: number, mm: number, ss = 0): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh, mm, ss) - TOKYO_MS;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function formatDayShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  void y;
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

export function formatTokyoStamp(ms: number): string {
  const p = tokyoParts(ms);
  const wd = WEEKDAYS[new Date(ms + TOKYO_MS).getUTCDay()] ?? "";
  return `${wd} ${p.d} ${MONTHS[p.m - 1]} · ${pad2(p.hh)}:${pad2(p.mm)}`;
}

export function formatTokyoClock(ms: number): string {
  const p = tokyoParts(ms);
  return `${pad2(p.hh)}:${pad2(p.mm)}`;
}

export function formatMinutesAfter18(mins: number): string {
  const total = Math.round(18 * 60 + mins);
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

export function minutesAfter18(ms: number): number {
  const p = tokyoParts(ms);
  let mins = p.hh * 60 + p.mm - 18 * 60;
  if (mins < 0) mins += 24 * 60;
  return mins;
}

/**
 * Apple Health dates look like `2024-06-01 07:12:33 +0900`.
 * Returns epoch milliseconds.
 */
export function parseAppleDate(input: string | undefined): number {
  if (!input) return Number.NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-])(\d{2}):?(\d{2})$/.exec(
    input.trim(),
  );
  if (!m) return Number.NaN;
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  const sign = m[7] === "-" ? -1 : 1;
  const offsetMin = sign * (Number(m[8]) * 60 + Number(m[9]));
  return utc - offsetMin * 60 * 1000;
}

export function rangeForPreset(
  preset: "30d" | "90d" | "1y" | "all",
  first: string,
  last: string,
): { start: string; end: string } {
  if (preset === "all") return { start: first, end: last };
  const days = preset === "30d" ? 29 : preset === "90d" ? 89 : 364;
  const start = addDays(last, -days);
  return { start: start < first ? first : start, end: last };
}
