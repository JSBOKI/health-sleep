import { persistParsed, loadHealth } from "./db";
import { looksLikeZip, parseHealthChunks, replay } from "./parseStream";
import type { ImportMeta, ParseProgress } from "./types";

export interface ImportSummary {
  fileName: string;
  scanned: number;
  kept: number;
  added: number;
  skipped: number;
  nights: number;
  maxBuffer: number;
}

export async function importHealthFile(
  file: File,
  onProgress?: (progress: ParseProgress) => void,
): Promise<ImportSummary> {
  const reader = file.stream().getReader();
  const first = await reader.read();
  const head = first.value ?? new Uint8Array();
  const zip = looksLikeZip(head);
  if (!zip) {
    const probe = new TextDecoder().decode(head.slice(0, 200));
    if (!probe.includes("<")) {
      throw new Error("Choose an Apple Health export.zip or the export.xml inside it.");
    }
  }
  onProgress?.({
    phase: zip ? "Opening zip" : "Reading export.xml",
    bytesRead: 0,
    bytesTotal: file.size,
    scanned: 0,
    kept: 0,
    added: 0,
    skipped: 0,
  });
  const parsed = await parseHealthChunks(replay(head, first.done, reader), {
    zip,
    totalBytes: file.size,
    onProgress,
  });
  if (zip && !parsed.foundXml) {
    throw new Error("That zip does not contain export.xml.");
  }
  if (parsed.scanned === 0) {
    throw new Error("No Health records were found. Use the export from the Health app.");
  }
  if (parsed.kept === 0) {
    throw new Error("That file has records, but none of the tracked metrics were in it.");
  }
  const existing = await loadHealth();
  const replaceDemo = existing.meta?.origin === "demo";
  onProgress?.({
    phase: replaceDemo ? "Replacing demo data" : "Saving on this device",
    bytesRead: file.size,
    bytesTotal: file.size,
    scanned: parsed.scanned,
    kept: parsed.kept,
    added: 0,
    skipped: parsed.dupes,
  });
  const meta: ImportMeta = {
    key: "import",
    origin: "export",
    lastImportAt: Date.now(),
    lastFileName: file.name || "export.xml",
    scanned: parsed.scanned,
    added: 0,
    skipped: 0,
  };
  const saved = await persistParsed({
    days: parsed.days,
    segments: parsed.segments,
    lows: parsed.lows,
    meta,
    replaceDemo,
    onProgress: (phase, done, total) => {
      onProgress?.({
        phase: `${phase} (${done.toLocaleString()} / ${total.toLocaleString()} days)`,
        bytesRead: file.size,
        bytesTotal: file.size,
        scanned: parsed.scanned,
        kept: parsed.kept,
        added: 0,
        skipped: parsed.dupes,
      });
    },
  });
  return {
    fileName: file.name || "export.xml",
    scanned: parsed.scanned,
    kept: parsed.kept,
    added: saved.added,
    skipped: saved.skipped + parsed.dupes,
    nights: saved.nights,
    maxBuffer: parsed.maxBuffer,
  };
}
