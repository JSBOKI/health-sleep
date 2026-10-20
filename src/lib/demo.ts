import { addDays, tokyoWallMs, weekdayIndex, ymd } from "./dates";
import { dedupeKey } from "./hash";
import { SLEEP_TYPE } from "./metrics";
import type { Annotation, SleepSegment, Spo2Low, StoredDay } from "./types";
import { dayId } from "./accumulate";

const WATCH = "Jeremy’s Apple Watch";
const PHONE = "Jeremy’s iPhone";
const CHANGE = "2026-02-14";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface DemoBundle {
  days: StoredDay[];
  segments: SleepSegment[];
  lows: Spo2Low[];
  annotations: Annotation[];
}

export function buildDemo(now = Date.parse("2026-10-18T12:00:00+09:00")): DemoBundle {
  const rng = mulberry32(20261018);
  const start = "2023-01-01";
  const end = "2026-10-18";
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  const total = dates.length;
  const sleepHours: number[] = [];
  const segments: SleepSegment[] = [];

  dates.forEach((date, index) => {
    const weekend = weekdayIndex(date) === 5 || weekdayIndex(date) === 6;
    let hours = 7.15 + gaussian(rng) * 0.48 + (weekend ? 0.25 : 0);
    if (index % 17 === 0) hours = 5.05 + rng() * 0.3;
    hours = clamp(hours, 4.4, 9.4);
    sleepHours.push(hours);
    const after18 = clamp(310 + gaussian(rng) * 22 + (weekend ? 48 : 0), 80, 560);
    const bedMs = tokyoWallMs(date, 18, 0) + after18 * 60000;
    const asleepMin = hours * 60;
    const awakeMin = 12 + rng() * 10;
    const deepMin = asleepMin * (0.13 + rng() * 0.04);
    const remMin = asleepMin * (0.2 + rng() * 0.05);
    const coreMin = Math.max(10, asleepMin - deepMin - remMin);
    const device = date < CHANGE ? "Watch6,18" : "Watch7,12";
    let cursor = bedMs;
    const pieces: Array<{ stage: SleepSegment["stage"]; minutes: number }> = [
      { stage: "deep", minutes: deepMin },
      { stage: "core", minutes: coreMin },
      { stage: "rem", minutes: remMin },
      { stage: "awake", minutes: awakeMin },
    ];
    const endMs = bedMs + (asleepMin + awakeMin) * 60000;
    for (const piece of pieces) {
      const next = cursor + piece.minutes * 60000;
      segments.push(segment(date, cursor, next, piece.stage, WATCH, device));
      cursor = next;
    }
    segments.push(segment(date, bedMs, endMs, "inBed", WATCH, device));
    if (index % 11 === 0) {
      segments.push(segment(date, bedMs + 15 * 60000, endMs - 10 * 60000, "asleep", PHONE, "iPhone14,7"));
    }
  });

  const days: StoredDay[] = [];
  const lows: Spo2Low[] = [];
  dates.forEach((date, index) => {
    const t = total <= 1 ? 0 : index / (total - 1);
    const device = date < CHANGE ? "Watch6,18" : "Watch7,12";
    const hrCount = date < CHANGE ? 24 : 288;
    const spo2Count = date < CHANGE ? 8 : 40;
    const prevSleep = sleepHours[index - 1] ?? 7.15;
    const sleepDelta = prevSleep - 7.15;
    let rhr = 63.5 + (56.5 - 63.5) * t - 1.15 * sleepDelta + gaussian(rng) * 0.85;
    if (date === "2026-08-03") rhr = 96;
    rhr = clamp(rhr, 42, 120);
    const hrv = clamp(34 + (49 - 34) * t + 4.2 * sleepDelta + gaussian(rng) * 2.1, 12, 120);
    const lowNight = index % 40 === 0;
    const spo2 = clamp(lowNight ? 95.1 + gaussian(rng) * 0.2 : 97.05 + gaussian(rng) * 0.32, 93, 100);
    const spo2Min = lowNight ? clamp(90.4 + rng() * 1.1, 90, 91.8) : clamp(spo2 - 0.8 - rng() * 0.4, 93, spo2);
    const spo2Max = clamp(spo2 + 0.7 + rng() * 0.5, spo2, 100);
    const rr = clamp(14.05 - 0.42 * (spo2 - 97) + gaussian(rng) * 0.22, 10, 24);
    const hr = clamp(rhr + 14 + gaussian(rng) * 3, rhr, 180);
    const month = Number(date.slice(5, 7));
    const seasonal = 1700 * Math.sin(((month - 3) / 12) * Math.PI * 2);
    const weekend = weekdayIndex(date) === 5 || weekdayIndex(date) === 6;
    const steps = Math.round(clamp(8400 + seasonal + (weekend ? 1100 : 0) + gaussian(rng) * 1300, 2200, 18000));
    const energy = clamp(steps * 0.045 + gaussian(rng) * 25, 80, 1400);
    const wrist = 0.08 * Math.sin(index / 28) + gaussian(rng) * 0.035;

    days.push(stat("rhr", date, WATCH, device, rhr, rhr, rhr, 1));
    days.push(stat("hrv", date, WATCH, device, hrv, hrv - 4, hrv + 6, date < CHANGE ? 1 : 4));
    days.push(stat("spo2", date, WATCH, device, (spo2 * (spo2Count - 1) + spo2Min) / spo2Count, spo2Min, spo2Max, spo2Count));
    days.push(stat("rr", date, WATCH, device, rr, rr - 0.6, rr + 0.8, date < CHANGE ? 6 : 30));
    days.push(stat("hr", date, WATCH, device, hr, Math.max(40, rhr - 6), Math.max(hr, 120 + rng() * 30), hrCount));
    days.push(stat("wrist", date, WATCH, device, wrist, wrist - 0.05, wrist + 0.05, 1));
    const stepDay = stat("steps", date, WATCH, device, steps, steps, steps, 24);
    stepDay.sources[PHONE] = {
      sum: Math.round(steps * 0.82),
      count: 24,
      min: 0,
      max: 400,
      devices: { "iPhone14,7": 24 },
    };
    days.push(stepDay);
    days.push(stat("energy", date, WATCH, device, energy, energy, energy, 12));
    if (index % 7 === 0) {
      const vo2 = clamp(41.2 + 4.6 * t + gaussian(rng) * 0.45, 30, 60);
      days.push(stat("vo2", date, WATCH, device, vo2, vo2, vo2, 1));
    }
    if (index % 3 === 0) {
      const weight = clamp(79.2 - 2.4 * t + gaussian(rng) * 0.12, 60, 120);
      days.push(stat("weight", date, WATCH, device, weight, weight, weight, 1));
    }
    if (lowNight) {
      const timeMs = tokyoWallMs(addDays(date, 1), 2, 14);
      const value = spo2Min;
      lows.push({
        id: dedupeKey("spo2-low", date, "02:14", value.toFixed(2), WATCH),
        timeMs,
        value,
        source: WATCH,
        device,
      });
    }
  });

  const annotations: Annotation[] = [
    {
      id: "ann-epitalon",
      date: "2025-06-01",
      label: "Started Epitalon course",
      createdAt: now,
    },
    {
      id: "ann-float",
      date: "2026-04-12",
      label: "Night-float week",
      createdAt: now,
    },
  ];
  return { days, segments, lows, annotations };
}

function stat(
  metric: StoredDay["metric"],
  date: string,
  source: string,
  device: string,
  mean: number,
  min: number,
  max: number,
  count: number,
): StoredDay {
  const lo = Math.min(min, mean, max);
  const hi = Math.max(min, mean, max);
  return {
    id: dayId(metric, date),
    metric,
    date,
    sources: {
      [source]: {
        sum: mean * (metric === "steps" || metric === "energy" ? 1 : count),
        count,
        min: lo,
        max: hi,
        devices: { [device]: count },
      },
    },
  };
}

function segment(
  night: string,
  startMs: number,
  endMs: number,
  stage: SleepSegment["stage"],
  source: string,
  device: string,
): SleepSegment {
  const id = dedupeKey(SLEEP_TYPE, String(startMs), String(endMs), stage, source);
  return { id, startMs, endMs, stage, source, device, night };
}

export function demoFileLabel(): string {
  return `Demo · ${ymd(2023, 1, 1)} to ${ymd(2026, 10, 18)}`;
}
