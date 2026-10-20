import type { NightSummary, SleepSegment, Stage } from "./types";

const ASLEEP: Stage[] = ["deep", "core", "rem", "asleep"];
const PRIORITY: Record<Exclude<Stage, "inBed">, number> = {
  deep: 5,
  rem: 4,
  core: 3,
  asleep: 2,
  awake: 1,
};

function durationMs(segs: SleepSegment[]): number {
  let total = 0;
  for (const seg of segs) total += Math.max(0, seg.endMs - seg.startMs);
  return total;
}

export function chooseSleepSource(segments: SleepSegment[]): SleepSegment[] {
  const groups = new Map<string, SleepSegment[]>();
  for (const seg of segments) {
    const list = groups.get(seg.source);
    if (list) list.push(seg);
    else groups.set(seg.source, [seg]);
  }
  const entries = [...groups.entries()];
  if (!entries.length) return [];
  const watches = entries.filter(([name]) => /watch/i.test(name));
  const pool = watches.length ? watches : entries;
  pool.sort((a, b) => durationMs(b[1]) - durationMs(a[1]));
  return pool[0]?.[1] ?? [];
}

function unionMinutes(intervals: Array<[number, number]>): number {
  if (!intervals.length) return 0;
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let total = 0;
  let start = sorted[0]?.[0] ?? 0;
  let end = sorted[0]?.[1] ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (!next) continue;
    if (next[0] <= end) end = Math.max(end, next[1]);
    else {
      total += end - start;
      start = next[0];
      end = next[1];
    }
  }
  total += end - start;
  return total / 60000;
}

function exclusiveMinutes(segments: SleepSegment[]): Record<Exclude<Stage, "inBed">, number> {
  const mins = { deep: 0, rem: 0, core: 0, asleep: 0, awake: 0 };
  type Ev = { t: number; kind: number; stage: Exclude<Stage, "inBed"> };
  const events: Ev[] = [];
  for (const seg of segments) {
    if (seg.stage === "inBed" || seg.endMs <= seg.startMs) continue;
    events.push({ t: seg.startMs, kind: 1, stage: seg.stage });
    events.push({ t: seg.endMs, kind: -1, stage: seg.stage });
  }
  events.sort((a, b) => a.t - b.t || a.kind - b.kind);
  const active = new Map<Exclude<Stage, "inBed">, number>();
  let last = events[0]?.t ?? 0;
  const winner = (): Exclude<Stage, "inBed"> | null => {
    let best: Exclude<Stage, "inBed"> | null = null;
    let p = 0;
    for (const [stage, count] of active) {
      if (count > 0 && PRIORITY[stage] > p) {
        p = PRIORITY[stage];
        best = stage;
      }
    }
    return best;
  };
  for (const ev of events) {
    const current = winner();
    if (current && ev.t > last) mins[current] += (ev.t - last) / 60000;
    active.set(ev.stage, (active.get(ev.stage) ?? 0) + ev.kind);
    last = ev.t;
  }
  return mins;
}

export function summarizeNight(night: string, segments: SleepSegment[]): NightSummary | null {
  if (!segments.length) return null;
  const stages = exclusiveMinutes(segments);
  const asleepMin = stages.deep + stages.core + stages.rem + stages.asleep;
  const inBedIntervals: Array<[number, number]> = [];
  const spanIntervals: Array<[number, number]> = [];
  let bedtimeMs: number | null = null;
  let wakeMs: number | null = null;
  let device = "";
  let deviceCount = -1;
  const devices = new Map<string, number>();
  for (const seg of segments) {
    devices.set(seg.device, (devices.get(seg.device) ?? 0) + 1);
    if (seg.stage === "inBed") inBedIntervals.push([seg.startMs, seg.endMs]);
    if (seg.stage !== "awake") {
      spanIntervals.push([seg.startMs, seg.endMs]);
      bedtimeMs = bedtimeMs == null ? seg.startMs : Math.min(bedtimeMs, seg.startMs);
      wakeMs = wakeMs == null ? seg.endMs : Math.max(wakeMs, seg.endMs);
    }
  }
  for (const [name, count] of devices) {
    if (count > deviceCount) {
      device = name;
      deviceCount = count;
    }
  }
  let inBedMin = unionMinutes(inBedIntervals);
  if (inBedMin <= 0 && bedtimeMs != null && wakeMs != null) {
    inBedMin = Math.max(0, (wakeMs - bedtimeMs) / 60000);
  }
  if (inBedMin <= 0) inBedMin = unionMinutes(spanIntervals) + stages.awake;
  const efficiency = inBedMin > 0 ? Math.max(0, Math.min(100, (asleepMin / inBedMin) * 100)) : null;
  return {
    night,
    source: segments[0]?.source ?? "",
    device,
    bedtimeMs,
    wakeMs,
    inBedMin,
    asleepMin,
    deepMin: stages.deep,
    coreMin: stages.core,
    remMin: stages.rem,
    unspecifiedMin: stages.asleep,
    awakeMin: stages.awake,
    efficiency,
  };
}

export function summarizeNights(segments: SleepSegment[]): NightSummary[] {
  const byNight = new Map<string, SleepSegment[]>();
  for (const seg of segments) {
    const list = byNight.get(seg.night);
    if (list) list.push(seg);
    else byNight.set(seg.night, [seg]);
  }
  const nights: NightSummary[] = [];
  for (const [night, segs] of byNight) {
    const chosen = chooseSleepSource(segs);
    const summary = summarizeNight(night, chosen);
    if (!summary) continue;
    if (summary.asleepMin < 20 && summary.inBedMin < 30) continue;
    nights.push(summary);
  }
  nights.sort((a, b) => (a.night < b.night ? -1 : a.night > b.night ? 1 : 0));
  return nights;
}

export function isAsleepStage(stage: Stage): boolean {
  return ASLEEP.includes(stage);
}
