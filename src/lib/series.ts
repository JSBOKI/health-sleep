import { addDays, eachDate, minutesAfter18 } from "./dates";
import type { DailyValue } from "./metrics";
import { rollingMean } from "./stats";
import type { NightSummary } from "./types";

export interface AlignedSeries {
  dates: string[];
  value: Array<number | null>;
  min: Array<number | null>;
  max: Array<number | null>;
  ma7: Array<number | null>;
  ma30: Array<number | null>;
}

export function alignDaily(values: DailyValue[], start: string, end: string): AlignedSeries {
  const ma7 = rollingMean(values, 7, addDays);
  const ma30 = rollingMean(values, 30, addDays);
  const byDate = new Map(values.map((row) => [row.date, row]));
  const dates = eachDate(start, end);
  return {
    dates,
    value: dates.map((date) => byDate.get(date)?.value ?? null),
    min: dates.map((date) => byDate.get(date)?.min ?? null),
    max: dates.map((date) => byDate.get(date)?.max ?? null),
    ma7: dates.map((date) => ma7.get(date) ?? null),
    ma30: dates.map((date) => ma30.get(date) ?? null),
  };
}

export interface SleepAlign {
  dates: string[];
  deep: number[];
  core: number[];
  rem: number[];
  unspecified: number[];
  awake: number[];
  asleep: Array<number | null>;
  bed: Array<number | null>;
  wake: Array<number | null>;
  bedMa: Array<number | null>;
  wakeMa: Array<number | null>;
}

export function alignSleep(nights: NightSummary[], start: string, end: string): SleepAlign {
  const inWindow = nights.filter((night) => night.night >= start && night.night <= end);
  const bedSeries = inWindow
    .filter((night) => night.bedtimeMs != null)
    .map((night) => ({ date: night.night, value: minutesAfter18(night.bedtimeMs ?? 0) }));
  const wakeSeries = inWindow
    .filter((night) => night.wakeMs != null)
    .map((night) => ({ date: night.night, value: minutesAfter18(night.wakeMs ?? 0) }));
  const bedMa = rollingMean(bedSeries, 7, addDays);
  const wakeMa = rollingMean(wakeSeries, 7, addDays);
  const byNight = new Map(inWindow.map((night) => [night.night, night]));
  const dates = eachDate(start, end);
  return {
    dates,
    deep: dates.map((date) => byNight.get(date)?.deepMin ?? 0),
    core: dates.map((date) => byNight.get(date)?.coreMin ?? 0),
    rem: dates.map((date) => byNight.get(date)?.remMin ?? 0),
    unspecified: dates.map((date) => byNight.get(date)?.unspecifiedMin ?? 0),
    awake: dates.map((date) => (byNight.has(date) ? (byNight.get(date)?.awakeMin ?? 0) : 0)),
    asleep: dates.map((date) => {
      const night = byNight.get(date);
      return night ? night.asleepMin / 60 : null;
    }),
    bed: dates.map((date) => {
      const ms = byNight.get(date)?.bedtimeMs;
      return ms == null ? null : minutesAfter18(ms);
    }),
    wake: dates.map((date) => {
      const ms = byNight.get(date)?.wakeMs;
      return ms == null ? null : minutesAfter18(ms);
    }),
    bedMa: dates.map((date) => bedMa.get(date) ?? null),
    wakeMa: dates.map((date) => wakeMa.get(date) ?? null),
  };
}

export function clockLabel(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const total = Math.round(18 * 60 + minutes);
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
