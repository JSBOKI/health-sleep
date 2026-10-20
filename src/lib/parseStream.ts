import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { Accumulator } from "./accumulate";
import type { BuildDay, ParseProgress, SleepSegment, Spo2Low } from "./types";
import { XmlRecordScanner } from "./xmlScan";

export interface ParseOutput {
  days: BuildDay[];
  segments: SleepSegment[];
  lows: Spo2Low[];
  scanned: number;
  kept: number;
  dupes: number;
  maxBuffer: number;
  foundXml: boolean;
}

function isExportXml(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  return base === "export.xml";
}

export async function parseHealthChunks(
  chunks: AsyncIterable<Uint8Array>,
  options: {
    zip: boolean;
    totalBytes: number;
    onProgress?: (progress: ParseProgress) => void;
  },
): Promise<ParseOutput> {
  const acc = new Accumulator();
  const scanner = new XmlRecordScanner((attrs) => acc.addAttrs(attrs));
  let bytesRead = 0;
  let foundXml = !options.zip;
  let lastReport = 0;

  const report = (phase: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 200) return;
    lastReport = now;
    options.onProgress?.({
      phase,
      bytesRead,
      bytesTotal: options.totalBytes,
      scanned: scanner.scanned,
      kept: acc.kept,
      added: 0,
      skipped: acc.dupes,
    });
  };

  if (!options.zip) {
    for await (const chunk of chunks) {
      bytesRead += chunk.byteLength;
      scanner.push(chunk, false);
      report("Reading export.xml");
    }
    scanner.push(new Uint8Array(), true);
    report("Reading export.xml", true);
  } else {
    let xmlStarted = false;
    let xmlFinished = false;
    let unzipError: Error | null = null;
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    unzip.onfile = (file) => {
      const wanted = isExportXml(file.name);
      file.ondata = (err, data, final) => {
        if (err) {
          unzipError = err instanceof Error ? err : new Error(String(err));
          return;
        }
        if (!wanted) return;
        xmlStarted = true;
        foundXml = true;
        if (data?.byteLength) scanner.push(data, false);
        if (final) {
          scanner.push(new Uint8Array(), true);
          xmlFinished = true;
        }
      };
      try {
        file.start();
      } catch (error) {
        if (wanted) unzipError = error instanceof Error ? error : new Error(String(error));
      }
    };

    for await (const chunk of chunks) {
      if (unzipError) throw unzipError;
      bytesRead += chunk.byteLength;
      unzip.push(chunk, false);
      report(xmlStarted ? "Parsing export.xml" : "Opening zip");
    }
    unzip.push(new Uint8Array(), true);
    if (unzipError) throw unzipError;
    if (xmlStarted && !xmlFinished) scanner.push(new Uint8Array(), true);
    report("Parsing export.xml", true);
  }

  const drained = acc.drain();
  return {
    days: drained.days,
    segments: drained.segments,
    lows: drained.lows,
    scanned: scanner.scanned,
    kept: acc.kept,
    dupes: acc.dupes,
    maxBuffer: scanner.maxBuffer,
    foundXml,
  };
}

export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function* replay(
  first: Uint8Array,
  firstDone: boolean,
  rest: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  if (first.byteLength) yield first;
  if (firstDone) return;
  while (true) {
    const next = await rest.read();
    if (next.value) yield next.value;
    if (next.done) break;
  }
}
