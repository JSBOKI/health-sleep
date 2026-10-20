import { addDays, daysBetween, formatDay, minutesAfter18, tokyoWallMs } from "./dates";
import {
  METRICS,
  METRIC_ORDER,
  formatHours,
  formatMetric,
  toDailyValue,
  type DailyValue,
} from "./metrics";
import {
  findOutliers,
  linearTrend,
  mannKendall,
  pearson,
  stdev,
  windowMean,
  type Outlier,
} from "./stats";
import type { MetricId, NightSummary, Spo2Low, StoredDay } from "./types";

export interface DeviceChange {
  metric: MetricId;
  date: string;
  from: string;
  to: string;
  samplingRatio: number | null;
}

export interface DeviceNote {
  text: string;
  spansRange: boolean;
  date: string;
}

export function detectDeviceChanges(days: StoredDay[]): DeviceChange[] {
  const byMetric = new Map<MetricId, DailyValue[]>();
  for (const day of days) {
    const value = toDailyValue(day);
    if (!value?.device) continue;
    const list = byMetric.get(day.metric);
    if (list) list.push(value);
    else byMetric.set(day.metric, [value]);
  }
  const changes: DeviceChange[] = [];
  for (const [metric, series] of byMetric) {
    series.sort((a, b) => (a.date < b.date ? -1 : 1));
    let current = "";
    let runDevice = "";
    let runStart = "";
    let run = 0;
    for (const point of series) {
      if (!current) {
        current = point.device;
        continue;
      }
      if (point.device === current) {
        run = 0;
        runDevice = "";
        continue;
      }
      if (point.device === runDevice) run += 1;
      else {
        runDevice = point.device;
        runStart = point.date;
        run = 1;
      }
      if (run >= 5 && runStart) {
        const before = series
          .filter((row) => row.date >= addDays(runStart, -21) && row.date < runStart)
          .map((row) => row.count);
        const after = series
          .filter((row) => row.date >= runStart && row.date < addDays(runStart, 21))
          .map((row) => row.count);
        const beforeMed = median(before);
        const afterMed = median(after);
        const ratio = beforeMed > 0 && afterMed > 0 ? afterMed / beforeMed : null;
        changes.push({ metric, date: runStart, from: current, to: runDevice, samplingRatio: ratio });
        current = runDevice;
        run = 0;
        runDevice = "";
      }
    }
  }
  changes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.metric < b.metric ? -1 : 1));
  return changes;
}

function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? Number.NaN) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function describeDeviceChanges(
  changes: DeviceChange[],
  range?: { start: string; end: string },
): DeviceNote | null {
  if (!changes.length) return null;
  const groups = new Map<string, DeviceChange[]>();
  for (const change of changes) {
    const key = `${change.date}|${change.from}|${change.to}`;
    const list = groups.get(key);
    if (list) list.push(change);
    else groups.set(key, [change]);
  }
  const notes: string[] = [];
  let spans = false;
  let firstDate = changes[0]?.date ?? "";
  for (const group of groups.values()) {
    const sample = group[0];
    if (!sample) continue;
    if (!firstDate || sample.date < firstDate) firstDate = sample.date;
    const inRange = !range || (sample.date > range.start && sample.date <= range.end);
    if (inRange) spans = true;
    const names = group.map((row) => METRICS[row.metric].label.toLowerCase());
    const ratios = group
      .map((row) => row.samplingRatio)
      .filter((ratio): ratio is number => ratio != null && (ratio >= 1.5 || ratio <= 0.67));
    const biggest = ratios.sort((a, b) => Math.abs(Math.log(b)) - Math.abs(Math.log(a)))[0];
    let sampling = "";
    if (biggest != null) {
      sampling =
        biggest >= 1
          ? ` Sample density rose about ${biggest >= 10 ? biggest.toFixed(0) : biggest.toFixed(1)}×.`
          : ` Sample density fell to about ${biggest.toFixed(1)}×.`;
    }
    notes.push(
      `On ${formatDay(sample.date)} the recorder changed from ${sample.from} to ${sample.to} (${names.join(", ")}).${sampling}`,
    );
  }
  const tail = spans
    ? " Trends that cross this change mix two devices."
    : " The selected range stays on one side of that change.";
  return { text: `${notes.join(" ")}${tail}`, spansRange: spans, date: firstDate };
}

export interface PeriodChange {
  delta: number | null;
  current: number | null;
  previous: number | null;
}

export interface MetricTrend {
  metric: MetricId;
  n: number;
  slopePerWeek: number;
  slopePerMonth: number;
  direction: "up" | "down" | "flat";
  meaningful: boolean;
  p: number;
  tau: number;
  wow: PeriodChange;
  mom: PeriodChange;
  mean: number | null;
  min: number | null;
  max: number | null;
  latest: DailyValue | null;
  outliers: Outlier[];
}

export interface CorrelationCard {
  id: string;
  label: string;
  detail: string;
  r: number;
  p: number;
  n: number;
}

function periodChange(values: DailyValue[], end: string, days: number): PeriodChange {
  const currentStart = addDays(end, -(days - 1));
  const prevEnd = addDays(currentStart, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  const current = windowMean(values, currentStart, end);
  const previous = windowMean(values, prevStart, prevEnd);
  return {
    current,
    previous,
    delta: current != null && previous != null ? current - previous : null,
  };
}

export function metricSeries(days: StoredDay[], metric: MetricId): DailyValue[] {
  const values: DailyValue[] = [];
  for (const day of days) {
    if (day.metric !== metric) continue;
    const value = toDailyValue(day);
    if (value) values.push(value);
  }
  values.sort((a, b) => (a.date < b.date ? -1 : 1));
  return values;
}

export function analyzeMetric(values: DailyValue[], metric: MetricId, range: { start: string; end: string }): MetricTrend {
  const inRange = values.filter((row) => row.date >= range.start && row.date <= range.end);
  const ys = inRange.map((row) => row.value);
  const mk = mannKendall(ys);
  const trend = linearTrend(inRange.map((row) => ({ t: tokyoWallMs(row.date, 12, 0), y: row.value })));
  const meaningful = inRange.length >= 14 && mk.p < 0.05 && Math.abs(trend.slopePerDay) > 0;
  const direction: MetricTrend["direction"] = !meaningful
    ? "flat"
    : trend.slopePerDay > 0
      ? "up"
      : "down";
  const nums = ys;
  return {
    metric,
    n: inRange.length,
    slopePerWeek: trend.slopePerDay * 7,
    slopePerMonth: trend.slopePerDay * 30,
    direction,
    meaningful,
    p: mk.p,
    tau: mk.tau,
    wow: periodChange(values, range.end, 7),
    mom: periodChange(values, range.end, 30),
    mean: nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    latest: inRange[inRange.length - 1] ?? null,
    outliers: findOutliers(values, range, addDays).slice(0, 8),
  };
}

export function analyzeAll(days: StoredDay[], range: { start: string; end: string }): MetricTrend[] {
  return METRIC_ORDER.map((metric) => analyzeMetric(metricSeries(days, metric), metric, range));
}

export function correlations(
  days: StoredDay[],
  nights: NightSummary[],
  range: { start: string; end: string },
): CorrelationCard[] {
  const rhr = new Map(metricSeries(days, "rhr").map((row) => [row.date, row.value]));
  const hrv = new Map(metricSeries(days, "hrv").map((row) => [row.date, row.value]));
  const spo2 = new Map(metricSeries(days, "spo2").map((row) => [row.date, row.value]));
  const rr = new Map(metricSeries(days, "rr").map((row) => [row.date, row.value]));
  const steps = new Map(metricSeries(days, "steps").map((row) => [row.date, row.value]));
  const sleepRhrX: number[] = [];
  const sleepRhrY: number[] = [];
  const sleepHrvX: number[] = [];
  const sleepHrvY: number[] = [];
  const effRhrX: number[] = [];
  const effRhrY: number[] = [];
  const stepsSleepX: number[] = [];
  const stepsSleepY: number[] = [];
  for (const night of nights) {
    if (night.night < range.start || night.night > range.end || night.asleepMin <= 0) continue;
    const next = addDays(night.night, 1);
    const hours = night.asleepMin / 60;
    const resting = rhr.get(next);
    if (resting != null) {
      sleepRhrX.push(hours);
      sleepRhrY.push(resting);
    }
    const variability = hrv.get(next);
    if (variability != null) {
      sleepHrvX.push(hours);
      sleepHrvY.push(variability);
    }
    if (night.efficiency != null && resting != null) {
      effRhrX.push(night.efficiency);
      effRhrY.push(resting);
    }
    const step = steps.get(night.night);
    if (step != null) {
      stepsSleepX.push(step);
      stepsSleepY.push(hours);
    }
  }
  const spo2X: number[] = [];
  const spo2Y: number[] = [];
  for (const [date, oxygen] of spo2) {
    if (date < range.start || date > range.end) continue;
    const breath = rr.get(date);
    if (breath == null) continue;
    spo2X.push(oxygen);
    spo2Y.push(breath);
  }
  const pack = (
    id: string,
    label: string,
    detail: string,
    xs: number[],
    ys: number[],
  ): CorrelationCard => {
    const result = pearson(xs, ys);
    return { id, label, detail, r: result.r, p: result.p, n: result.n };
  };
  return [
    pack("sleep-rhr", "Sleep duration and next-day resting HR", "Hours asleep versus resting heart rate the next morning.", sleepRhrX, sleepRhrY),
    pack("sleep-hrv", "Sleep duration and next-day HRV", "Hours asleep versus SDNN the next day.", sleepHrvX, sleepHrvY),
    pack("eff-rhr", "Sleep efficiency and next-day resting HR", "Efficiency versus resting heart rate the next morning.", effRhrX, effRhrY),
    pack("steps-sleep", "Steps and that night's sleep", "Daytime steps versus hours asleep the night of that date.", stepsSleepX, stepsSleepY),
    pack("spo2-rr", "Blood oxygen and respiratory rate", "Same-day mean SpO2 versus mean respiratory rate.", spo2X, spo2Y),
  ];
}

export function buildInsights(
  trends: MetricTrend[],
  corrs: CorrelationCard[],
  nights: NightSummary[],
  lows: Spo2Low[],
  range: { start: string; end: string },
): string[] {
  const bullets: string[] = [];
  const ranked = trends
    .filter((trend) => trend.meaningful)
    .slice()
    .sort((a, b) => Math.abs(b.tau) - Math.abs(a.tau));
  if (!ranked.length) {
    bullets.push("No metric in this range shows a steady trend (Mann–Kendall p below 0.05, with at least two weeks of days).");
  }
  for (const trend of ranked.slice(0, 3)) {
    const info = METRICS[trend.metric];
    const verb = trend.direction === "up" ? "rose" : "fell";
    bullets.push(
      `${info.label} ${verb} by about ${formatMetric(trend.metric, Math.abs(trend.slopePerWeek), false)} ${info.unit} per week in this range (Mann–Kendall p = ${trend.p < 0.001 ? "< 0.001" : trend.p.toFixed(3)}).`,
    );
  }
  const lowCount = lows.filter((low) => {
    const date = new Date(low.timeMs + 9 * 3600 * 1000);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    return key >= range.start && key <= range.end;
  }).length;
  if (lowCount > 0) {
    bullets.push(
      `${lowCount} blood oxygen reading${lowCount === 1 ? "" : "s"} fell under 92% in this range.`,
    );
  }
  const nightsInRange = nights.filter((night) => night.night >= range.start && night.night <= range.end && night.bedtimeMs != null);
  if (nightsInRange.length >= 14) {
    const bed = nightsInRange.map((night) => minutesAfter18(night.bedtimeMs ?? 0));
    const spread = stdev(bed);
    if (spread >= 45) {
      bullets.push(`Bedtime varied by about ${Math.round(spread)} minutes (standard deviation) in this range.`);
    }
    const asleep = nightsInRange.reduce((s, night) => s + night.asleepMin, 0) / nightsInRange.length;
    bullets.push(`Average time asleep in this range is ${formatHours(asleep)} across ${nightsInRange.length} nights.`);
  }
  for (const corr of corrs) {
    if (corr.n >= 20 && corr.p < 0.05 && Math.abs(corr.r) >= 0.2) {
      const word = corr.r > 0 ? "move together" : "move in opposite directions";
      bullets.push(`${corr.label} ${word} (r = ${corr.r.toFixed(2)}, ${corr.n} paired days).`);
    }
  }
  const outlierCount = trends.reduce((sum, trend) => sum + trend.outliers.length, 0);
  if (outlierCount > 0) {
    bullets.push(
      `${outlierCount} daily value${outlierCount === 1 ? "" : "s"} sit more than 2 standard deviations from the trailing 30-day baseline.`,
    );
  }
  if (range.start && range.end) {
    const span = daysBetween(range.start, range.end) + 1;
    if (bullets.length === 0) bullets.push(`Nothing strong stands out across these ${span} days.`);
  }
  return bullets.slice(0, 7);
}

export function fixedWindows(values: DailyValue[]): {
  latest: DailyValue | null;
  avg7: number | null;
  avg30: number | null;
  delta30: number | null;
} {
  const latest = values[values.length - 1] ?? null;
  if (!latest) return { latest: null, avg7: null, avg30: null, delta30: null };
  const avg7 = windowMean(values, addDays(latest.date, -6), latest.date);
  const avg30 = windowMean(values, addDays(latest.date, -29), latest.date);
  const prior = windowMean(values, addDays(latest.date, -59), addDays(latest.date, -30));
  return {
    latest,
    avg7,
    avg30,
    delta30: avg30 != null && prior != null ? avg30 - prior : null,
  };
}
