import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { Zip, ZipPassThrough, zipSync, strToU8 } from "fflate";
import { mergeBuild } from "../src/lib/accumulate.ts";
import {
  analyzeMetric,
  correlations,
  detectDeviceChanges,
  metricSeries,
} from "../src/lib/analysis.ts";
import { buildDemo } from "../src/lib/demo.ts";
import { dateKeyFromMs, nightKeyFromMs, parseAppleDate } from "../src/lib/dates.ts";
import { dedupeKey } from "../src/lib/hash.ts";
import { preferredSource, toDailyValue } from "../src/lib/metrics.ts";
import { parseHealthChunks } from "../src/lib/parseStream.ts";
import { summarizeNights } from "../src/lib/sleep.ts";
import { mannKendall, normalCdf, pearson, studentTTwoTail } from "../src/lib/stats.ts";
import type { SleepSegment } from "../src/lib/types.ts";

let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("ok", name);
  } catch (error) {
    failed++;
    console.error("FAIL", name);
    console.error(error);
  }
}

function xmlRecord(attrs: Record<string, string>, multiline = false): string {
  const body = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  if (!multiline) return `<Record ${body}/>`;
  return `<Record ${body}>\n  <MetadataEntry key="HKTimeZone" value="Asia/Tokyo"/>\n</Record>`;
}

const WATCH = "Jeremy’s Apple Watch";
const DEVICE = "&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch6,18, software:10.1&gt;";

await test("apple date and tokyo night", () => {
  const utcEvening = parseAppleDate("2024-05-01 16:00:00 +0000");
  assert.equal(dateKeyFromMs(utcEvening), "2024-05-02");
  assert.equal(nightKeyFromMs(utcEvening), "2024-05-01");
  assert.equal(nightKeyFromMs(parseAppleDate("2024-05-01 23:00:00 +0900")), "2024-05-01");
  assert.equal(nightKeyFromMs(parseAppleDate("2024-05-02 01:30:00 +0900")), "2024-05-01");
  assert.equal(nightKeyFromMs(parseAppleDate("2024-05-02 15:00:00 +0900")), "2024-05-02");
});

await test("mann-kendall and normal cdf", () => {
  const rising = mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(rising.S, 45);
  assert.ok(rising.p < 0.001);
  assert.ok(rising.tau > 0.9);
  const flat = mannKendall([3, 3, 3, 3, 3, 3, 3]);
  assert.equal(flat.S, 0);
  assert.ok(flat.p > 0.9);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 0.002);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 0.002);
  const p = studentTTwoTail(1.96, 1000);
  assert.ok(p > 0.04 && p < 0.06, `t p was ${p}`);
});

await test("pearson", () => {
  const perfect = pearson([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12]);
  assert.ok(perfect.r > 0.999);
  assert.ok(perfect.p < 0.001);
  const opposite = pearson([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1]);
  assert.ok(opposite.r < -0.999);
});

await test("sleep prefers apple watch and assigns the evening", () => {
  const night = "2024-05-01";
  const segments: SleepSegment[] = [
    seg("iphone", "2024-05-01 23:00:00 +0900", "2024-05-02 07:00:00 +0900", "asleep", "Jeremy’s iPhone", night),
    seg("deep", "2024-05-01 23:10:00 +0900", "2024-05-02 00:30:00 +0900", "deep", WATCH, night),
    seg("core", "2024-05-02 00:30:00 +0900", "2024-05-02 05:00:00 +0900", "core", WATCH, night),
    seg("rem", "2024-05-02 05:00:00 +0900", "2024-05-02 06:40:00 +0900", "rem", WATCH, night),
    seg("awake", "2024-05-02 06:40:00 +0900", "2024-05-02 07:00:00 +0900", "awake", WATCH, night),
  ];
  const [summary] = summarizeNights(segments);
  assert.ok(summary);
  assert.equal(summary.night, night);
  assert.equal(summary.source, WATCH);
  assert.ok(Math.abs(summary.deepMin - 80) < 0.2);
  assert.ok(Math.abs(summary.coreMin - 270) < 0.2);
  assert.ok(Math.abs(summary.asleepMin - 450) < 0.5);
  assert.ok((summary.efficiency ?? 0) > 90);
});

await test("merge skips duplicate keys", () => {
  const first = mergeBuild(undefined, "", {
    metric: "spo2",
    date: "2024-01-01",
    sources: new Map([
      [
        WATCH,
        {
          sum: 97,
          count: 1,
          min: 97,
          max: 97,
          devices: { "Watch6,18": 1 },
          keys: ["abc"],
          values: [97],
          devs: ["Watch6,18"],
          seen: new Set(["abc"]),
        },
      ],
    ]),
  });
  assert.equal(first.added, 1);
  assert.equal(first.day.sources[WATCH]?.sum, 97);
  const second = mergeBuild(first.day, first.keys, {
    metric: "spo2",
    date: "2024-01-01",
    sources: new Map([
      [
        WATCH,
        {
          sum: 188,
          count: 2,
          min: 91,
          max: 97,
          devices: { "Watch6,18": 2 },
          keys: ["abc", "def"],
          values: [97, 91],
          devs: ["Watch6,18", "Watch6,18"],
          seen: new Set(["abc", "def"]),
        },
      ],
    ]),
  });
  assert.equal(second.added, 1);
  assert.equal(second.skipped, 1);
  assert.equal(second.day.sources[WATCH]?.count, 2);
  assert.equal(second.day.sources[WATCH]?.sum, 188);
  assert.equal(second.day.sources[WATCH]?.min, 91);
});

await test("streaming xml and deflate zip", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
 <ExportDate value="2026-10-20 10:00:00 +0900"/>
 ${xmlRecord({
   type: "HKQuantityTypeIdentifierOxygenSaturation",
   sourceName: WATCH,
   unit: "%",
   startDate: "2024-01-01 23:10:00 +0900",
   endDate: "2024-01-01 23:10:00 +0900",
   value: "0.97",
   device: DEVICE,
 })}
 ${xmlRecord(
   {
     type: "HKQuantityTypeIdentifierOxygenSaturation",
     sourceName: WATCH,
     unit: "%",
     startDate: "2024-01-02 02:14:00 +0900",
     endDate: "2024-01-02 02:14:00 +0900",
     value: "0.91",
     device: DEVICE,
   },
   true,
 )}
 ${xmlRecord({
   type: "HKQuantityTypeIdentifierOxygenSaturation",
   sourceName: WATCH,
   unit: "%",
   startDate: "2024-01-02 02:14:00 +0900",
   endDate: "2024-01-02 02:14:00 +0900",
   value: "0.91",
   device: DEVICE,
 })}
 ${xmlRecord({
   type: "HKQuantityTypeIdentifierBodyMass",
   sourceName: WATCH,
   unit: "lb",
   startDate: "2024-01-02 08:00:00 +0900",
   endDate: "2024-01-02 08:00:00 +0900",
   value: "180",
 })}
 ${xmlRecord({
   type: "HKQuantityTypeIdentifierStepCount",
   sourceName: WATCH,
   unit: "count",
   startDate: "2024-01-02 09:00:00 +0900",
   endDate: "2024-01-02 10:00:00 +0900",
   value: "100",
 })}
 ${xmlRecord({
   type: "HKQuantityTypeIdentifierStepCount",
   sourceName: "Jeremy’s iPhone",
   unit: "count",
   startDate: "2024-01-02 09:00:00 +0900",
   endDate: "2024-01-02 10:00:00 +0900",
   value: "80",
 })}
 ${xmlRecord({
   type: "HKCategoryTypeIdentifierSleepAnalysis",
   sourceName: WATCH,
   startDate: "2024-05-01 23:10:00 +0900",
   endDate: "2024-05-02 06:40:00 +0900",
   value: "HKCategoryValueSleepAnalysisAsleepCore",
   device: DEVICE,
 })}
 ${xmlRecord({
   type: "HKQuantityTypeIdentifierHeartRate",
   sourceName: WATCH,
   unit: "count/min",
   startDate: "2024-01-02 12:00:00 +0900",
   endDate: "2024-01-02 12:00:00 +0900",
   value: "61",
 })}
</HealthData>`;
  const direct = await parseHealthChunks(slices(new TextEncoder().encode(xml), 7), {
    zip: false,
    totalBytes: xml.length,
  });
  assert.ok(direct.maxBuffer < 64 * 1024, `buffer ${direct.maxBuffer}`);
  const spo2 = direct.days.find((day) => day.metric === "spo2" && day.date === "2024-01-01");
  const spo2Stat = spo2?.sources.get(WATCH);
  assert.ok(spo2Stat);
  assert.equal(spo2Stat.count, 1);
  assert.ok(Math.abs(spo2Stat.sum - 97) < 0.01);
  const lowDay = direct.days.find((day) => day.metric === "spo2" && day.date === "2024-01-02");
  assert.equal(lowDay?.sources.get(WATCH)?.count, 1);
  assert.equal(direct.lows.length, 1);
  assert.ok(Math.abs((direct.lows[0]?.value ?? 0) - 91) < 0.01);
  const weight = toDailyValue(mergeBuild(undefined, "", direct.days.find((day) => day.metric === "weight")!).day);
  assert.ok(weight && Math.abs(weight.value - 180 * 0.45359237) < 0.01);
  const steps = toDailyValue(mergeBuild(undefined, "", direct.days.find((day) => day.metric === "steps")!).day);
  assert.equal(steps?.value, 100);
  assert.match(steps?.source ?? "", /Watch/);
  const nights = summarizeNights(direct.segments);
  assert.equal(nights.length, 1);
  assert.equal(nights[0]?.night, "2024-05-01");

  const zipped = zipSync({
    "apple_health_export/export.xml": strToU8(xml),
    "apple_health_export/export_cda.xml": strToU8(
      `<ClinicalDocument><Record type="HKQuantityTypeIdentifierOxygenSaturation" value="0.10" startDate="2024-01-02 02:14:00 +0900" endDate="2024-01-02 02:14:00 +0900" sourceName="Trap"/></Record></ClinicalDocument>`,
    ),
  });
  const fromZip = await parseHealthChunks(slices(zipped, 13), { zip: true, totalBytes: zipped.byteLength });
  assert.equal(fromZip.foundXml, true);
  assert.equal(fromZip.lows.length, 1);
  assert.ok((fromZip.lows[0]?.value ?? 0) > 80);
  assert.equal(dedupeKey("a", "b", "c", "d", "e"), dedupeKey("a", "b", "c", "d", "e"));
  assert.notEqual(dedupeKey("a", "b", "c", "d", "e"), dedupeKey("a", "b", "c", "d", "f"));
});

await test("demo trends, correlation, device change, outlier", () => {
  const demo = buildDemo();
  const days = demo.days;
  const nights = summarizeNights(demo.segments);
  assert.ok(nights.length > 1000);
  const watchSteps = preferredSource(days.find((day) => day.metric === "steps")!);
  assert.match(watchSteps?.name ?? "", /Watch/);
  const rhr = metricSeries(days, "rhr");
  const all = { start: rhr[0]!.date, end: rhr[rhr.length - 1]!.date };
  const trend = analyzeMetric(rhr, "rhr", all);
  assert.ok(trend.meaningful, `rhr p ${trend.p}`);
  assert.ok(trend.slopePerWeek < 0);
  assert.equal(trend.direction, "down");
  const hrv = analyzeMetric(metricSeries(days, "hrv"), "hrv", all);
  assert.ok(hrv.meaningful && hrv.slopePerWeek > 0);
  const year = { start: "2025-10-19", end: "2026-10-18" };
  const corr = correlations(days, nights, year).find((item) => item.id === "sleep-rhr");
  assert.ok(corr && corr.n > 100);
  assert.ok(corr.r < -0.3, `r ${corr.r}`);
  assert.ok(corr.p < 0.05, `p ${corr.p}`);
  const hrvCorr = correlations(days, nights, year).find((item) => item.id === "sleep-hrv");
  assert.ok(hrvCorr && hrvCorr.r > 0.3 && hrvCorr.p < 0.05);
  const changes = detectDeviceChanges(days);
  const hrChange = changes.find((change) => change.metric === "hr");
  assert.ok(hrChange);
  assert.equal(hrChange.date, "2026-02-14");
  assert.equal(hrChange.from, "Watch6,18");
  assert.equal(hrChange.to, "Watch7,12");
  assert.ok((hrChange.samplingRatio ?? 0) > 5);
  const flagged = trend.outliers.some((item) => item.date === "2026-08-03");
  const fullFlags = analyzeMetric(rhr, "rhr", { start: "2026-07-01", end: "2026-09-01" });
  assert.ok(fullFlags.outliers.some((item) => item.date === "2026-08-03") || flagged);
  assert.ok(demo.lows.length > 10);
  for (const metric of ["spo2", "rhr", "hr", "hrv", "rr", "steps", "energy", "vo2", "wrist", "weight"] as const) {
    assert.ok(days.some((day) => day.metric === metric), metric);
  }
});

if (process.argv.includes("--big")) {
  await test("100MB synthetic export.zip streams in bounded memory", async () => {
    const path = "/tmp/jeremy-health-export.zip";
    const bytes = await writeBigZip(path);
    const size = (await stat(path)).size;
    console.log("zip MB", (size / 1e6).toFixed(1), "written", bytes);
    assert.ok(size > 90 * 1e6 && size < 130 * 1e6, `size ${size}`);
    const started = Date.now();
    const parsed = await parseHealthChunks(nodeChunks(path, 256 * 1024), {
      zip: true,
      totalBytes: size,
      onProgress: (progress) => {
        if (progress.bytesRead % (20 * 1024 * 1024) < 256 * 1024) {
          console.log(
            "progress",
            (progress.bytesRead / 1e6).toFixed(0),
            "MB",
            "scanned",
            progress.scanned,
            "kept",
            progress.kept,
          );
        }
      },
    });
    console.log("parsed in", ((Date.now() - started) / 1000).toFixed(1), "s", "maxBuffer", parsed.maxBuffer);
    assert.ok(parsed.maxBuffer < 256 * 1024, `buffer held ${parsed.maxBuffer}`);
    assert.ok(parsed.scanned > 100_000);
    assert.equal(parsed.foundXml, true);
    const metrics = new Set(parsed.days.map((day) => day.metric));
    for (const metric of ["spo2", "rhr", "hr", "hrv", "rr", "steps", "energy", "vo2", "wrist", "weight"]) {
      assert.ok(metrics.has(metric as never), metric);
    }
    const spo2Days = parsed.days.filter((day) => day.metric === "spo2");
    const sample = spo2Days[Math.floor(spo2Days.length / 2)];
    const sourceStat = sample ? [...sample.sources.values()][0] : undefined;
    const mean = sourceStat && sourceStat.count ? sourceStat.sum / sourceStat.count : 0;
    assert.ok(mean > 90 && mean <= 100, `spo2 mean ${mean}`);
    assert.ok(summarizeNights(parsed.segments).length > 365);
    assert.ok(parsed.lows.length > 0);
    const stored = new Map<string, { day: ReturnType<typeof mergeBuild>["day"]; keys: string }>();
    for (const build of parsed.days) {
      const merged = mergeBuild(undefined, "", build);
      stored.set(merged.day.id, { day: merged.day, keys: merged.keys });
    }
    const again = await parseHealthChunks(nodeChunks(path, 512 * 1024), { zip: true, totalBytes: size });
    let added = 0;
    for (const build of again.days) {
      const prev = stored.get(`${build.metric}|${build.date}`);
      added += mergeBuild(prev?.day, prev?.keys ?? "", build).added;
    }
    assert.equal(added, 0);
    const heap = process.memoryUsage().heapUsed / 1e6;
    console.log("heap MB", heap.toFixed(0));
  });
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all checks passed");

function seg(
  id: string,
  start: string,
  end: string,
  stage: SleepSegment["stage"],
  source: string,
  night: string,
): SleepSegment {
  return {
    id,
    startMs: parseAppleDate(start),
    endMs: parseAppleDate(end),
    stage,
    source,
    device: "Watch6,18",
    night,
  };
}

async function* slices(data: Uint8Array, size: number) {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, Math.min(data.length, i + size));
}

async function* nodeChunks(path: string, size: number) {
  const stream = Readable.toWeb(createReadStream(path, { highWaterMark: size })) as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  while (true) {
    const next = await reader.read();
    if (next.value) yield next.value;
    if (next.done) break;
  }
}

async function writeBigZip(path: string): Promise<number> {
  const target = 100 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let written = 0;
  const zip = new Zip((err, data, final) => {
    if (err) throw err;
    chunks.push(data);
    written += data.byteLength;
    void final;
  });
  const pass = new ZipPassThrough("apple_health_export/export.xml");
  zip.add(pass);
  const encoder = new TextEncoder();
  const push = (text: string, final = false) => {
    pass.push(encoder.encode(text), final);
  };
  push(`<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_US">\n<ExportDate value="2026-10-20 09:00:00 +0900"/>\n`);
  const start = Date.UTC(2022, 0, 1);
  const end = Date.UTC(2026, 9, 15);
  let dayIndex = 0;
  for (let t = start; t <= end && written < target - 2_000_000; t += 86400000) {
    const date = new Date(t + 9 * 3600 * 1000);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const watchChange = iso >= "2026-02-14";
    const hardware = watchChange ? "Watch7,12" : "Watch6,18";
    const device = `&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:${hardware}, software:10.6&gt;`;
    const lines: string[] = [];
    const hrEvery = watchChange ? 10 : 30;
    for (let minute = 0; minute < 24 * 60; minute += hrEvery) {
      lines.push(quantity("HKQuantityTypeIdentifierHeartRate", iso, minute, (60 + ((minute + dayIndex) % 17)).toFixed(0), "count/min", device));
    }
    for (let hour = 0; hour < 24; hour++) {
      lines.push(quantity("HKQuantityTypeIdentifierStepCount", iso, hour * 60, String(80 + ((hour * 13 + dayIndex) % 400)), "count", device));
      lines.push(quantity("HKQuantityTypeIdentifierStepCount", iso, hour * 60, String(40 + (hour % 20)), "count", device, "Jeremy’s iPhone"));
    }
    const spo2n = watchChange ? 16 : 6;
    for (let i = 0; i < spo2n; i++) {
      const minute = 23 * 60 + i * 5;
      const fraction = dayIndex % 37 === 0 && i === 0 ? "0.908" : (0.96 + ((i + dayIndex) % 5) * 0.005).toFixed(3);
      lines.push(quantity("HKQuantityTypeIdentifierOxygenSaturation", iso, minute, fraction, "%", device));
    }
    lines.push(quantity("HKQuantityTypeIdentifierRestingHeartRate", iso, 7 * 60, String(58 + (dayIndex % 6)), "count/min", device));
    lines.push(quantity("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", iso, 7 * 60 + 5, String(35 + (dayIndex % 12)), "ms", device));
    lines.push(quantity("HKQuantityTypeIdentifierRespiratoryRate", iso, 2 * 60, (13 + (dayIndex % 4) * 0.3).toFixed(1), "count/min", device));
    lines.push(quantity("HKQuantityTypeIdentifierActiveEnergyBurned", iso, 18 * 60, String(400 + (dayIndex % 80)), "kcal", device));
    lines.push(quantity("HKQuantityTypeIdentifierAppleSleepingWristTemperature", iso, 3 * 60, ((dayIndex % 7) * 0.04 - 0.1).toFixed(2), "degC", device));
    if (dayIndex % 3 === 0) lines.push(quantity("HKQuantityTypeIdentifierBodyMass", iso, 8 * 60, (78 - dayIndex * 0.001).toFixed(2), "kg", device));
    if (dayIndex % 7 === 0) lines.push(quantity("HKQuantityTypeIdentifierVO2Max", iso, 8 * 60 + 10, (42 + (dayIndex % 5) * 0.2).toFixed(1), "mL/min·kg", device));
    lines.push(
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Jeremy’s Apple Watch" unit="" startDate="${iso} 23:10:00 +0900" endDate="${shift(iso, 1)} 01:30:00 +0900" value="HKCategoryValueSleepAnalysisAsleepDeep" device="${device}"/>`,
    );
    lines.push(
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Jeremy’s Apple Watch" unit="" startDate="${shift(iso, 1)} 01:30:00 +0900" endDate="${shift(iso, 1)} 05:10:00 +0900" value="HKCategoryValueSleepAnalysisAsleepCore" device="${device}"/>`,
    );
    lines.push(
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Jeremy’s Apple Watch" unit="" startDate="${shift(iso, 1)} 05:10:00 +0900" endDate="${shift(iso, 1)} 06:20:00 +0900" value="HKCategoryValueSleepAnalysisAsleepREM" device="${device}"/>`,
    );
    lines.push(
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Jeremy’s iPhone" unit="" startDate="${iso} 23:00:00 +0900" endDate="${shift(iso, 1)} 07:00:00 +0900" value="HKCategoryValueSleepAnalysisAsleep"/>`,
    );
    push(lines.join("\n") + "\n");
    dayIndex++;
    if (dayIndex % 200 === 0) console.log("generating", iso, "zip MB", (written / 1e6).toFixed(1));
  }
  let extra = 0;
  while (written < target - 500_000 && extra < 200_000) {
    const minute = extra % (24 * 60);
    const day = Math.floor(extra / 50);
    const iso = shift("2024-06-01", day % 400);
    push(
      quantity("HKQuantityTypeIdentifierHeartRate", iso, minute, String(55 + (extra % 30)), "count/min", DEVICE) + "\n",
    );
    extra++;
  }
  push("</HealthData>\n", true);
  zip.end();
  await writeFile(path, Buffer.concat(chunks));
  return written;
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + days * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function quantity(
  type: string,
  iso: string,
  minuteOfDay: number,
  value: string,
  unit: string,
  device: string,
  source = "Jeremy’s Apple Watch",
): string {
  const dayBump = Math.floor(minuteOfDay / (24 * 60));
  const minute = minuteOfDay % (24 * 60);
  const date = dayBump ? shift(iso, dayBump) : iso;
  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
  const mm = String(minute % 60).padStart(2, "0");
  const stamp = `${date} ${hh}:${mm}:00 +0900`;
  return `<Record type="${type}" sourceName="${source}" sourceVersion="10.6" unit="${unit}" creationDate="${stamp}" startDate="${stamp}" endDate="${stamp}" value="${value}" device="${device}"/>`;
}
