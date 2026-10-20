import type { MetricId, SourceStat, Stage, StoredDay } from "./types";

export const RECORD_TYPES: Record<string, MetricId> = {
  HKQuantityTypeIdentifierOxygenSaturation: "spo2",
  HKQuantityTypeIdentifierRestingHeartRate: "rhr",
  HKQuantityTypeIdentifierHeartRate: "hr",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierRespiratoryRate: "rr",
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "energy",
  HKQuantityTypeIdentifierVO2Max: "vo2",
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: "wrist",
  HKQuantityTypeIdentifierBodyMass: "weight",
};

export const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";

export interface MetricInfo {
  id: MetricId;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  favorable: "up" | "down" | "neutral";
  band: boolean;
  sum: boolean;
  caption: string;
  color: string;
}

export const METRICS: Record<MetricId, MetricInfo> = {
  spo2: {
    id: "spo2",
    label: "Blood oxygen",
    short: "SpO2",
    unit: "%",
    decimals: 1,
    favorable: "up",
    band: true,
    sum: false,
    caption: "Daily mean of Apple oxygen saturation. Values stored as a fraction are shown as percent.",
    color: "#5ee0d0",
  },
  rhr: {
    id: "rhr",
    label: "Resting heart rate",
    short: "Resting HR",
    unit: "bpm",
    decimals: 0,
    favorable: "down",
    band: true,
    sum: false,
    caption: "Daily resting heart rate from Apple Health.",
    color: "#ff8b7b",
  },
  hr: {
    id: "hr",
    label: "Heart rate",
    short: "Heart rate",
    unit: "bpm",
    decimals: 0,
    favorable: "down",
    band: true,
    sum: false,
    caption: "Daily mean of recorded heart-rate samples. Workout-heavy days sit higher.",
    color: "#ffb087",
  },
  hrv: {
    id: "hrv",
    label: "Heart rate variability",
    short: "HRV",
    unit: "ms",
    decimals: 0,
    favorable: "up",
    band: true,
    sum: false,
    caption: "Daily mean of SDNN heart-rate variability.",
    color: "#c4b5fd",
  },
  rr: {
    id: "rr",
    label: "Respiratory rate",
    short: "Resp. rate",
    unit: "breaths/min",
    decimals: 1,
    favorable: "neutral",
    band: true,
    sum: false,
    caption: "Daily mean respiratory rate, usually sampled during sleep.",
    color: "#7eb6ff",
  },
  steps: {
    id: "steps",
    label: "Steps",
    short: "Steps",
    unit: "steps",
    decimals: 0,
    favorable: "up",
    band: false,
    sum: true,
    caption: "Daily total. When both iPhone and Apple Watch recorded steps, the Watch is used.",
    color: "#3ddc97",
  },
  energy: {
    id: "energy",
    label: "Active energy",
    short: "Active energy",
    unit: "kcal",
    decimals: 0,
    favorable: "up",
    band: false,
    sum: true,
    caption: "Daily active energy. Apple Watch is preferred when the iPhone also recorded it.",
    color: "#f0b429",
  },
  vo2: {
    id: "vo2",
    label: "VO2 max",
    short: "VO₂ max",
    unit: "mL/kg·min",
    decimals: 1,
    favorable: "up",
    band: true,
    sum: false,
    caption: "Cardio fitness estimates. Apple records these on occasional days, not every day.",
    color: "#67e8f9",
  },
  wrist: {
    id: "wrist",
    label: "Wrist temperature",
    short: "Wrist temp",
    unit: "°C",
    decimals: 2,
    favorable: "neutral",
    band: true,
    sum: false,
    caption: "Sleeping wrist temperature as a change from your baseline, in °C.",
    color: "#f9a8d4",
  },
  weight: {
    id: "weight",
    label: "Weight",
    short: "Weight",
    unit: "kg",
    decimals: 1,
    favorable: "neutral",
    band: true,
    sum: false,
    caption: "Body mass converted to kilograms.",
    color: "#cbd5e1",
  },
};

export const METRIC_ORDER: MetricId[] = [
  "spo2",
  "rhr",
  "hrv",
  "rr",
  "hr",
  "wrist",
  "steps",
  "energy",
  "vo2",
  "weight",
];

const RANGES: Record<MetricId, [number, number]> = {
  spo2: [50, 100],
  rhr: [25, 220],
  hr: [25, 250],
  hrv: [1, 400],
  rr: [3, 60],
  steps: [0, 200000],
  energy: [0, 20000],
  vo2: [5, 90],
  wrist: [-5, 5],
  weight: [20, 400],
};

export function isQuantityType(type: string): type is keyof typeof RECORD_TYPES {
  return Object.prototype.hasOwnProperty.call(RECORD_TYPES, type);
}

export function stageFromCategory(value: string | undefined): Stage | null {
  switch (value) {
    case "HKCategoryValueSleepAnalysisInBed":
    case "0":
      return "inBed";
    case "HKCategoryValueSleepAnalysisAwake":
    case "2":
      return "awake";
    case "HKCategoryValueSleepAnalysisAsleepCore":
    case "3":
      return "core";
    case "HKCategoryValueSleepAnalysisAsleepDeep":
    case "4":
      return "deep";
    case "HKCategoryValueSleepAnalysisAsleepREM":
    case "5":
      return "rem";
    case "HKCategoryValueSleepAnalysisAsleepUnspecified":
    case "HKCategoryValueSleepAnalysisAsleep":
    case "1":
      return "asleep";
    default:
      return null;
  }
}

export function convertValue(metric: MetricId, raw: number, unit: string | undefined): number | null {
  if (!Number.isFinite(raw)) return null;
  let value = raw;
  if (metric === "spo2") {
    value = raw <= 1.5 ? raw * 100 : raw;
  } else if (metric === "weight") {
    const u = (unit ?? "").toLowerCase();
    if (u === "lb" || u === "lbs") value = raw * 0.45359237;
  } else if (metric === "energy") {
    const u = (unit ?? "").toLowerCase();
    if (u === "kj") value = raw / 4.184;
    else if (u === "cal") value = raw / 1000;
  } else if (metric === "wrist") {
    const u = (unit ?? "").toLowerCase();
    if (u === "degf" || u === "°f" || u === "f") value = ((raw - 32) * 5) / 9;
  }
  const [lo, hi] = RANGES[metric];
  if (value < lo || value > hi) return null;
  return value;
}

export function deviceLabel(device: string | undefined, source: string): string {
  if (device) {
    const hw = /hardware:([^,>]+)/i.exec(device);
    if (hw?.[1]) return hw[1].trim();
    const name = /name:([^,>]+)/i.exec(device);
    if (name?.[1]) return name[1].trim();
    const trimmed = device.trim();
    if (trimmed) return trimmed.slice(0, 48);
  }
  if (/watch/i.test(source)) return "Apple Watch";
  if (/iphone/i.test(source)) return "iPhone";
  return source || "Unknown";
}

export function preferredSource(day: StoredDay): { name: string; stat: SourceStat } | null {
  const names = Object.keys(day.sources);
  if (!names.length) return null;
  const watches = names.filter((name) => /watch/i.test(name));
  const pool = (watches.length ? watches : names).slice();
  pool.sort((a, b) => day.sources[b].count - day.sources[a].count);
  const name = pool[0];
  if (!name) return null;
  const stat = day.sources[name];
  if (!stat || stat.count <= 0) return null;
  return { name, stat };
}

export interface DailyValue {
  date: string;
  value: number;
  min: number;
  max: number;
  count: number;
  source: string;
  device: string;
}

export function dominantDevice(devices: Record<string, number>): string {
  let best = "";
  let n = -1;
  for (const [name, count] of Object.entries(devices)) {
    if (count > n) {
      best = name;
      n = count;
    }
  }
  return best;
}

export function toDailyValue(day: StoredDay): DailyValue | null {
  const picked = preferredSource(day);
  if (!picked) return null;
  const info = METRICS[day.metric];
  const value = info.sum ? picked.stat.sum : picked.stat.sum / picked.stat.count;
  return {
    date: day.date,
    value,
    min: info.sum ? value : picked.stat.min,
    max: info.sum ? value : picked.stat.max,
    count: picked.stat.count,
    source: picked.name,
    device: dominantDevice(picked.stat.devices),
  };
}

export function formatMetric(metric: MetricId, value: number, signed = false): string {
  const info = METRICS[metric];
  const sign = signed && value > 0 ? "+" : "";
  if (metric === "steps" || metric === "energy") {
    return sign + Math.round(value).toLocaleString("en-US");
  }
  if (metric === "wrist") {
    const body = `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
    return signed ? body : body;
  }
  const body = value.toFixed(info.decimals);
  return signed && value > 0 ? `+${body}` : body;
}

export function formatHours(mins: number): string {
  if (!Number.isFinite(mins)) return "—";
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  if (h <= 0) return `${sign}${m}m`;
  return `${sign}${h}h ${pad(m)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function flatThreshold(metric: MetricId): number {
  switch (metric) {
    case "steps":
      return 50;
    case "energy":
      return 5;
    case "weight":
      return 0.05;
    case "wrist":
      return 0.01;
    case "spo2":
    case "vo2":
    case "rr":
      return 0.05;
    default:
      return 0.5;
  }
}

export type DeltaTone = "good" | "bad" | "neutral";

export function deltaTone(metric: MetricId, delta: number): DeltaTone {
  if (Math.abs(delta) < flatThreshold(metric)) return "neutral";
  const fav = METRICS[metric].favorable;
  if (fav === "neutral") return "neutral";
  const rising = delta > 0;
  if (fav === "up") return rising ? "good" : "bad";
  return rising ? "bad" : "good";
}
