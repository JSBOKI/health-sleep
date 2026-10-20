import { dateKeyFromMs, nightKeyFromMs, parseAppleDate } from "./dates";
import { dedupeKey } from "./hash";
import {
  RECORD_TYPES,
  SLEEP_TYPE,
  convertValue,
  deviceLabel,
  isQuantityType,
  stageFromCategory,
} from "./metrics";
import type { BuildDay, BuildSource, MetricId, SleepSegment, SourceStat, Spo2Low, StoredDay } from "./types";

export function dayId(metric: MetricId, date: string): string {
  return `${metric}|${date}`;
}

function blankSource(): BuildSource {
  return {
    sum: 0,
    count: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    devices: {},
    keys: [],
    values: [],
    devs: [],
    seen: new Set(),
  };
}

export class Accumulator {
  readonly days = new Map<string, BuildDay>();
  readonly segments: SleepSegment[] = [];
  readonly lows: Spo2Low[] = [];
  kept = 0;
  dupes = 0;
  pending = 0;
  private readonly segSeen = new Set<string>();
  private readonly lowSeen = new Set<string>();

  addAttrs(attrs: Record<string, string>): void {
    const type = attrs.type;
    if (!type) return;
    if (type === SLEEP_TYPE) {
      this.addSleep(attrs);
      return;
    }
    if (!isQuantityType(type)) return;
    const metric = RECORD_TYPES[type];
    const raw = Number(attrs.value);
    const value = convertValue(metric, raw, attrs.unit);
    if (value == null) return;
    const start = attrs.startDate;
    if (!start) return;
    const startMs = parseAppleDate(start);
    if (!Number.isFinite(startMs)) return;
    const end = attrs.endDate || start;
    const source = attrs.sourceName || "Unknown";
    const device = deviceLabel(attrs.device, source);
    const key = dedupeKey(type, start, end, attrs.value ?? "", source);
    const date = dateKeyFromMs(startMs);
    const id = dayId(metric, date);
    let day = this.days.get(id);
    if (!day) {
      day = { metric, date, sources: new Map() };
      this.days.set(id, day);
    }
    let bucket = day.sources.get(source);
    if (!bucket) {
      bucket = blankSource();
      day.sources.set(source, bucket);
    }
    if (bucket.seen.has(key)) {
      this.dupes++;
      return;
    }
    bucket.seen.add(key);
    bucket.keys.push(key);
    bucket.values.push(value);
    bucket.devs.push(device);
    bucket.sum += value;
    bucket.count += 1;
    bucket.min = Math.min(bucket.min, value);
    bucket.max = Math.max(bucket.max, value);
    if (device) bucket.devices[device] = (bucket.devices[device] ?? 0) + 1;
    this.kept++;
    this.pending++;
    if (metric === "spo2" && value < 92 && !this.lowSeen.has(key)) {
      this.lowSeen.add(key);
      this.lows.push({ id: key, timeMs: startMs, value, source, device });
    }
  }

  private addSleep(attrs: Record<string, string>): void {
    const stage = stageFromCategory(attrs.value);
    if (!stage) return;
    const start = attrs.startDate;
    const end = attrs.endDate || start;
    if (!start || !end) return;
    const startMs = parseAppleDate(start);
    const endMs = parseAppleDate(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
    if (endMs - startMs > 20 * 60 * 60 * 1000) return;
    const source = attrs.sourceName || "Unknown";
    const key = dedupeKey(SLEEP_TYPE, start, end, attrs.value ?? "", source);
    if (this.segSeen.has(key)) {
      this.dupes++;
      return;
    }
    this.segSeen.add(key);
    this.segments.push({
      id: key,
      startMs,
      endMs,
      stage,
      source,
      device: deviceLabel(attrs.device, source),
      night: nightKeyFromMs(startMs),
    });
    this.kept++;
    this.pending++;
  }

  drain(): { days: BuildDay[]; segments: SleepSegment[]; lows: Spo2Low[] } {
    const days = [...this.days.values()];
    const segments = this.segments.splice(0, this.segments.length);
    const lows = this.lows.splice(0, this.lows.length);
    this.days.clear();
    this.pending = 0;
    return { days, segments, lows };
  }
}

export function mergeBuild(
  existing: StoredDay | undefined,
  existingKeyList: string,
  build: BuildDay,
): { day: StoredDay; keys: string; added: number; skipped: number } {
  const seen = new Set(existingKeyList ? existingKeyList.split(",") : []);
  const sources: Record<string, SourceStat> = {};
  if (existing) {
    for (const [name, stat] of Object.entries(existing.sources)) {
      sources[name] = {
        sum: stat.sum,
        count: stat.count,
        min: stat.min,
        max: stat.max,
        devices: { ...stat.devices },
      };
    }
  }
  let added = 0;
  let skipped = 0;
  const fresh: string[] = [];
  for (const [name, bucket] of build.sources) {
    const stat = sources[name] ?? {
      sum: 0,
      count: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      devices: {},
    };
    for (let i = 0; i < bucket.keys.length; i++) {
      const key = bucket.keys[i];
      if (!key || seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      fresh.push(key);
      const value = bucket.values[i] ?? 0;
      stat.sum += value;
      stat.count += 1;
      stat.min = Math.min(stat.min, value);
      stat.max = Math.max(stat.max, value);
      const device = bucket.devs[i];
      if (device) stat.devices[device] = (stat.devices[device] ?? 0) + 1;
      added++;
    }
    if (stat.count > 0 && Number.isFinite(stat.min)) sources[name] = stat;
  }
  const id = dayId(build.metric, build.date);
  const keys = existingKeyList
    ? fresh.length
      ? `${existingKeyList},${fresh.join(",")}`
      : existingKeyList
    : fresh.join(",");
  return {
    day: { id, metric: build.metric, date: build.date, sources },
    keys,
    added,
    skipped,
  };
}

export function materializeDays(days: Iterable<BuildDay>): StoredDay[] {
  const out: StoredDay[] = [];
  for (const build of days) out.push(mergeBuild(undefined, "", build).day);
  return out;
}
