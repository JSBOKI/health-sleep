import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildDemo } from "@/lib/demo";
import {
  deleteDatabase,
  deleteAnnotation,
  loadHealth,
  putAnnotation,
  writeDemo,
} from "@/lib/db";
import type { WorkerResponse } from "@/worker/import.worker";
import type {
  Annotation,
  ImportMeta,
  NightSummary,
  ParseProgress,
  RangeState,
  Spo2Low,
  StoredDay,
} from "@/lib/types";

interface HealthContextValue {
  loading: boolean;
  loadError: string | null;
  days: StoredDay[];
  nights: NightSummary[];
  lows: Spo2Low[];
  annotations: Annotation[];
  meta: ImportMeta | null;
  range: RangeState;
  setRange: (range: RangeState) => void;
  progress: ParseProgress | null;
  importError: string | null;
  importSummary: string | null;
  busy: boolean;
  openImport: () => void;
  importFile: (file: File) => void;
  loadDemo: () => Promise<void>;
  clearAll: () => Promise<void>;
  addAnnotation: (date: string, label: string) => Promise<void>;
  removeAnnotation: (id: string) => Promise<void>;
}

const HealthContext = createContext<HealthContextValue | null>(null);

const EMPTY_RANGE: RangeState = { preset: "90d", start: "", end: "" };

export function HealthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [days, setDays] = useState<StoredDay[]>([]);
  const [nights, setNights] = useState<NightSummary[]>([]);
  const [lows, setLows] = useState<Spo2Low[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [range, setRange] = useState<RangeState>(EMPTY_RANGE);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const refresh = useCallback(async () => {
    const snapshot = await loadHealth();
    setDays(snapshot.days);
    setNights(snapshot.nights);
    setLows(snapshot.lows);
    setAnnotations(snapshot.annotations);
    setMeta(snapshot.meta);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadHealth()
      .then((snapshot) => {
        if (cancelled) return;
        setDays(snapshot.days);
        setNights(snapshot.nights);
        setLows(snapshot.lows);
        setAnnotations(snapshot.annotations);
        setMeta(snapshot.meta);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not open on-device storage.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
    };
  }, []);

  const runImport = useCallback(
    (file: File) => {
      workerRef.current?.terminate();
      setBusy(true);
      setImportError(null);
      setImportSummary(null);
      setProgress({
        phase: "Starting",
        bytesRead: 0,
        bytesTotal: file.size,
        scanned: 0,
        kept: 0,
        added: 0,
        skipped: 0,
      });
      const worker = new Worker(new URL("../worker/import.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === "progress") setProgress(message.progress);
        if (message.type === "error") {
          setImportError(message.message);
          setProgress(null);
          setBusy(false);
        }
        if (message.type === "done") {
          const summary = message.summary;
          setImportSummary(
            `Added ${summary.added.toLocaleString()} samples from ${summary.fileName}. Skipped ${summary.skipped.toLocaleString()} duplicates. ${summary.nights.toLocaleString()} nights on file.`,
          );
          setProgress(null);
          setBusy(false);
          void refresh();
        }
      };
      worker.onerror = () => {
        setImportError("The import worker stopped before it finished. Try the file again.");
        setProgress(null);
        setBusy(false);
      };
      worker.postMessage({ file });
    },
    [refresh],
  );

  const openImport = useCallback(() => fileRef.current?.click(), []);

  const loadDemo = useCallback(async () => {
    setBusy(true);
    setImportError(null);
    setImportSummary(null);
    setProgress({
      phase: "Building a few years of demo days",
      bytesRead: 0,
      bytesTotal: 0,
      scanned: 0,
      kept: 0,
      added: 0,
      skipped: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const bundle = buildDemo();
      await writeDemo({
        days: bundle.days,
        segments: bundle.segments,
        lows: bundle.lows,
        meta: {
          key: "import",
          origin: "demo",
          lastImportAt: Date.now(),
          lastFileName: "Demo data",
          scanned: bundle.days.length,
          added: bundle.days.length,
          skipped: 0,
        },
      });
      for (const annotation of bundle.annotations) {
        const exists = annotations.some((item) => item.id === annotation.id);
        if (!exists) await putAnnotation(annotation);
      }
      await refresh();
      setImportSummary("Demo data is stored only in this browser. Clear it before importing a real export.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not build demo data.");
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }, [annotations, refresh]);

  const clearAll = useCallback(async () => {
    setBusy(true);
    try {
      await deleteDatabase();
      setDays([]);
      setNights([]);
      setLows([]);
      setAnnotations([]);
      setMeta(null);
      setImportSummary(null);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not clear on-device data.");
    } finally {
      setBusy(false);
    }
  }, []);

  const addAnnotation = useCallback(
    async (date: string, label: string) => {
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        date,
        label: label.trim(),
        createdAt: Date.now(),
      };
      await putAnnotation(annotation);
      await refresh();
    },
    [refresh],
  );

  const removeAnnotation = useCallback(
    async (id: string) => {
      await deleteAnnotation(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<HealthContextValue>(
    () => ({
      loading,
      loadError,
      days,
      nights,
      lows,
      annotations,
      meta,
      range,
      setRange,
      progress,
      importError,
      importSummary,
      busy,
      openImport,
      importFile: runImport,
      loadDemo,
      clearAll,
      addAnnotation,
      removeAnnotation,
    }),
    [
      loading,
      loadError,
      days,
      nights,
      lows,
      annotations,
      meta,
      range,
      progress,
      importError,
      importSummary,
      busy,
      openImport,
      runImport,
      loadDemo,
      clearAll,
      addAnnotation,
      removeAnnotation,
    ],
  );

  return (
    <HealthContext.Provider value={value}>
      {children}
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.xml,application/zip,text/xml,application/xml"
        className="sr-only"
        aria-label="Choose an Apple Health export"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) runImport(file);
        }}
      />
    </HealthContext.Provider>
  );
}

export function useHealth(): HealthContextValue {
  const value = useContext(HealthContext);
  if (!value) throw new Error("useHealth must be used inside HealthProvider");
  return value;
}
