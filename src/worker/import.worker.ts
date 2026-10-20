import { closeDb } from "../lib/db";
import { importHealthFile, type ImportSummary } from "../lib/importFile";
import type { ParseProgress } from "../lib/types";

export interface WorkerRequest {
  file: File;
}

export type WorkerResponse =
  | { type: "progress"; progress: ParseProgress }
  | { type: "done"; summary: ImportSummary }
  | { type: "error"; message: string };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const file = event.data?.file;
  if (!file) {
    scope.postMessage({ type: "error", message: "No file was provided." } satisfies WorkerResponse);
    return;
  }
  void importHealthFile(file, (progress) => {
    scope.postMessage({ type: "progress", progress } satisfies WorkerResponse);
  })
    .then((summary) => {
      closeDb();
      scope.postMessage({ type: "done", summary } satisfies WorkerResponse);
    })
    .catch((error: unknown) => {
      closeDb();
      const message = error instanceof Error ? error.message : "Import failed.";
      scope.postMessage({ type: "error", message } satisfies WorkerResponse);
    });
};
