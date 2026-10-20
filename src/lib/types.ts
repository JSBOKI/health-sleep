export const METRIC_IDS = [
  "spo2",
  "rhr",
  "hr",
  "hrv",
  "rr",
  "steps",
  "energy",
  "vo2",
  "wrist",
  "weight",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export type Stage = "inBed" | "awake" | "asleep" | "core" | "deep" | "rem";

export interface SourceStat {
  sum: number;
  count: number;
  min: number;
  max: number;
  devices: Record<string, number>;
}

export interface StoredDay {
  id: string;
  metric: MetricId;
  date: string;
  sources: Record<string, SourceStat>;
}

export interface KeyRecord {
  id: string;
  list: string;
}

export interface SleepSegment {
  id: string;
  startMs: number;
  endMs: number;
  stage: Stage;
  source: string;
  device: string;
  night: string;
}

export interface NightSummary {
  night: string;
  source: string;
  device: string;
  bedtimeMs: number | null;
  wakeMs: number | null;
  inBedMin: number;
  asleepMin: number;
  deepMin: number;
  coreMin: number;
  remMin: number;
  unspecifiedMin: number;
  awakeMin: number;
  efficiency: number | null;
}

export interface Spo2Low {
  id: string;
  timeMs: number;
  value: number;
  source: string;
  device: string;
}

export interface Annotation {
  id: string;
  date: string;
  label: string;
  createdAt: number;
}

export interface ImportMeta {
  key: "import";
  origin: "demo" | "export";
  lastImportAt: number;
  lastFileName: string;
  scanned: number;
  added: number;
  skipped: number;
}

export interface BuildSource {
  sum: number;
  count: number;
  min: number;
  max: number;
  devices: Record<string, number>;
  keys: string[];
  values: number[];
  devs: string[];
  seen: Set<string>;
}

export interface BuildDay {
  metric: MetricId;
  date: string;
  sources: Map<string, BuildSource>;
}

export interface ParseProgress {
  phase: string;
  bytesRead: number;
  bytesTotal: number;
  scanned: number;
  kept: number;
  added: number;
  skipped: number;
}

export type RangePreset = "30d" | "90d" | "1y" | "all" | "custom";

export interface RangeState {
  preset: RangePreset;
  start: string;
  end: string;
}
