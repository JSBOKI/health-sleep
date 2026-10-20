import { rangeForPreset } from "./dates";
import type { NightSummary, RangeState, StoredDay } from "./types";

export function dataExtent(days: StoredDay[], nights: NightSummary[]): { first: string; last: string } | null {
  let first = "";
  let last = "";
  const consider = (date: string) => {
    if (!date) return;
    if (!first || date < first) first = date;
    if (!last || date > last) last = date;
  };
  for (const day of days) consider(day.date);
  for (const night of nights) consider(night.night);
  return first && last ? { first, last } : null;
}

export function resolveRange(range: RangeState, first: string, last: string): { start: string; end: string } {
  if (range.preset === "custom" && range.start && range.end) {
    let start = range.start <= range.end ? range.start : range.end;
    let end = range.start <= range.end ? range.end : range.start;
    if (start < first) start = first;
    if (end > last) end = last;
    if (start > end) return { start: first, end: last };
    return { start, end };
  }
  const preset = range.preset === "custom" ? "90d" : range.preset;
  return rangeForPreset(preset, first, last);
}
