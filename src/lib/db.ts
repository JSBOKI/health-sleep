import { mergeBuild } from "./accumulate";
import { summarizeNights } from "./sleep";
import type {
  Annotation,
  BuildDay,
  ImportMeta,
  KeyRecord,
  NightSummary,
  SleepSegment,
  Spo2Low,
  StoredDay,
} from "./types";

const DB_NAME = "jeremy-health-sleep";
const DB_VERSION = 1;

export interface HealthSnapshot {
  days: StoredDay[];
  nights: NightSummary[];
  lows: Spo2Low[];
  annotations: Annotation[];
  meta: ImportMeta | null;
}

let cached: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function closeDb(): void {
  cached?.close();
  cached = null;
  opening = null;
}

export function openDb(): Promise<IDBDatabase> {
  if (cached) return Promise.resolve(cached);
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("days")) db.createObjectStore("days", { keyPath: "id" });
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys", { keyPath: "id" });
      if (!db.objectStoreNames.contains("segments")) db.createObjectStore("segments", { keyPath: "id" });
      if (!db.objectStoreNames.contains("lows")) db.createObjectStore("lows", { keyPath: "id" });
      if (!db.objectStoreNames.contains("nights")) db.createObjectStore("nights", { keyPath: "night" });
      if (!db.objectStoreNames.contains("annotations")) {
        db.createObjectStore("annotations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      cached = request.result;
      cached.onversionchange = () => closeDb();
      resolve(cached);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("Could not open on-device storage"));
    };
  });
  return opening;
}

export async function loadHealth(): Promise<HealthSnapshot> {
  const db = await openDb();
  const tx = db.transaction(["days", "nights", "lows", "annotations", "meta"], "readonly");
  const [days, nights, lows, annotations, meta] = await Promise.all([
    req<StoredDay[]>(tx.objectStore("days").getAll()),
    req<NightSummary[]>(tx.objectStore("nights").getAll()),
    req<Spo2Low[]>(tx.objectStore("lows").getAll()),
    req<Annotation[]>(tx.objectStore("annotations").getAll()),
    req<ImportMeta | undefined>(tx.objectStore("meta").get("import")),
  ]);
  await txDone(tx);
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.metric < b.metric ? -1 : 1));
  nights.sort((a, b) => (a.night < b.night ? -1 : 1));
  lows.sort((a, b) => b.timeMs - a.timeMs);
  annotations.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.createdAt - a.createdAt));
  return { days, nights, lows, annotations, meta: meta ?? null };
}

async function clearStores(names: string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(names, "readwrite");
  await Promise.all(names.map((name) => req(tx.objectStore(name).clear())));
  await txDone(tx);
}

export async function clearHealthStores(): Promise<void> {
  await clearStores(["days", "keys", "segments", "lows", "nights"]);
}

export async function deleteDatabase(): Promise<void> {
  closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete on-device data"));
    request.onblocked = () => resolve();
  });
}

export async function putAnnotation(annotation: Annotation): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("annotations", "readwrite");
  tx.objectStore("annotations").put(annotation);
  await txDone(tx);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("annotations", "readwrite");
  tx.objectStore("annotations").delete(id);
  await txDone(tx);
}

export async function writeDemo(input: {
  days: StoredDay[];
  segments: SleepSegment[];
  lows: Spo2Low[];
  meta: ImportMeta;
}): Promise<void> {
  await clearHealthStores();
  const db = await openDb();
  const tx = db.transaction(["days", "segments", "lows", "nights", "meta"], "readwrite");
  for (const day of input.days) tx.objectStore("days").put(day);
  for (const segment of input.segments) tx.objectStore("segments").put(segment);
  for (const low of input.lows) tx.objectStore("lows").put(low);
  for (const night of summarizeNights(input.segments)) tx.objectStore("nights").put(night);
  tx.objectStore("meta").put(input.meta);
  await txDone(tx);
}

export interface PersistResult {
  added: number;
  skipped: number;
  nights: number;
}

export async function persistParsed(input: {
  days: BuildDay[];
  segments: SleepSegment[];
  lows: Spo2Low[];
  meta: ImportMeta;
  replaceDemo: boolean;
  onProgress?: (phase: string, done: number, total: number) => void;
}): Promise<PersistResult> {
  if (input.replaceDemo) await clearHealthStores();
  const db = await openDb();
  let added = 0;
  let skipped = 0;
  const total = input.days.length;
  const chunk = 80;
  for (let offset = 0; offset < input.days.length; offset += chunk) {
    const slice = input.days.slice(offset, offset + chunk);
    const tx = db.transaction(["days", "keys"], "readwrite");
    const dayStore = tx.objectStore("days");
    const keyStore = tx.objectStore("keys");
    const reads = slice.map((build) => {
      const id = `${build.metric}|${build.date}`;
      return {
        build,
        day: req<StoredDay | undefined>(dayStore.get(id)),
        keys: req<KeyRecord | undefined>(keyStore.get(id)),
      };
    });
    const resolved = await Promise.all(
      reads.map(async (row) => ({ build: row.build, day: await row.day, keys: await row.keys })),
    );
    for (const row of resolved) {
      const merged = mergeBuild(row.day, row.keys?.list ?? "", row.build);
      added += merged.added;
      skipped += merged.skipped;
      if (merged.day && Object.keys(merged.day.sources).length) dayStore.put(merged.day);
      keyStore.put({ id: merged.day.id, list: merged.keys } satisfies KeyRecord);
    }
    await txDone(tx);
    input.onProgress?.("Saving daily summaries", Math.min(total, offset + slice.length), total);
  }

  const side = db.transaction(["segments", "lows"], "readwrite");
  for (const segment of input.segments) side.objectStore("segments").put(segment);
  for (const low of input.lows) side.objectStore("lows").put(low);
  await txDone(side);

  const segments = await req<SleepSegment[]>(
    db.transaction("segments", "readonly").objectStore("segments").getAll(),
  );
  const nights = summarizeNights(segments);
  const nightTx = db.transaction("nights", "readwrite");
  await req(nightTx.objectStore("nights").clear());
  for (const night of nights) nightTx.objectStore("nights").put(night);
  await txDone(nightTx);

  const metaTx = db.transaction("meta", "readwrite");
  const previous = await req<ImportMeta | undefined>(metaTx.objectStore("meta").get("import"));
  const meta: ImportMeta = {
    ...input.meta,
    added: (input.replaceDemo ? 0 : (previous?.added ?? 0)) + added,
    skipped,
    scanned: input.meta.scanned,
  };
  metaTx.objectStore("meta").put(meta);
  await txDone(metaTx);
  return { added, skipped, nights: nights.length };
}
