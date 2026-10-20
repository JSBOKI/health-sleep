import { rollingMean } from "./stats";
import { addDays } from "./dates";
import type { DailyValue } from "./metrics";
import type { NightSummary } from "./types";

function cell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(cell).join(",")).join("\n");
}

export function downloadText(filename: string, contents: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function dailyCsv(metric: string, values: DailyValue[]): string {
  const ma7 = rollingMean(values, 7, addDays);
  const ma30 = rollingMean(values, 30, addDays);
  const rows: Array<Array<string | number | null>> = [
    ["date", "value", "min", "max", "samples", "rolling_7d", "rolling_30d", "source", "device"],
  ];
  for (const row of values) {
    rows.push([
      row.date,
      round(row.value),
      round(row.min),
      round(row.max),
      row.count,
      round(ma7.get(row.date) ?? null),
      round(ma30.get(row.date) ?? null),
      row.source,
      row.device,
    ]);
  }
  void metric;
  return toCsv(rows);
}

export function sleepCsv(nights: NightSummary[]): string {
  const rows: Array<Array<string | number | null>> = [
    [
      "night",
      "asleep_min",
      "in_bed_min",
      "deep_min",
      "core_min",
      "rem_min",
      "unspecified_min",
      "awake_min",
      "efficiency_pct",
      "bedtime_tokyo",
      "wake_tokyo",
      "source",
      "device",
    ],
  ];
  for (const night of nights) {
    rows.push([
      night.night,
      round(night.asleepMin),
      round(night.inBedMin),
      round(night.deepMin),
      round(night.coreMin),
      round(night.remMin),
      round(night.unspecifiedMin),
      round(night.awakeMin),
      night.efficiency == null ? null : round(night.efficiency),
      night.bedtimeMs == null ? null : new Date(night.bedtimeMs).toISOString(),
      night.wakeMs == null ? null : new Date(night.wakeMs).toISOString(),
      night.source,
      night.device,
    ]);
  }
  return toCsv(rows);
}

function round(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}
