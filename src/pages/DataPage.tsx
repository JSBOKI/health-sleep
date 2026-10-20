import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHealth } from "@/context/HealthContext";
import { formatDay, formatTokyoStamp } from "@/lib/dates";
import { METRICS, METRIC_ORDER } from "@/lib/metrics";
import type { MetricId } from "@/lib/types";

export function DataPage() {
  const {
    days,
    nights,
    lows,
    annotations,
    meta,
    openImport,
    importFile,
    loadDemo,
    clearAll,
    addAnnotation,
    removeAnnotation,
    busy,
    importError,
    importSummary,
    progress,
  } = useHealth();
  const [confirmClear, setConfirmClear] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("2026-10-18");
  const [hot, setHot] = useState(false);
  const counts = countMetrics(days);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Data</h1>
        <p className="text-sm text-muted-foreground">
          The export is read on this device and kept in IndexedDB. There is no account, no server, and no analytics.
        </p>
      </div>
      <Card
        onDragOver={(event) => {
          event.preventDefault();
          setHot(true);
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(event) => {
          event.preventDefault();
          setHot(false);
          const file = event.dataTransfer.files[0];
          if (file) importFile(file);
        }}
        className={hot ? "ring-2 ring-primary" : ""}
      >
        <CardHeader>
          <CardTitle>Import or re-import</CardTitle>
          <CardDescription>
            Use the zip from the Health app, or export.xml inside it. A newer export merges in. Records already stored are skipped, not duplicated. On an iPhone, pick the file from Files.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="h-11" onClick={openImport} disabled={busy}>
            {meta ? "Re-import export" : "Choose export"}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => void loadDemo()} disabled={busy}>
            Load demo data
          </Button>
        </CardContent>
      </Card>
      {progress && <p className="text-sm text-muted-foreground">{progress.phase}</p>}
      {importError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{importError}</p>}
      {importSummary && <p className="rounded-lg border px-3 py-2 text-sm">{importSummary}</p>}
      <Card>
        <CardHeader>
          <CardTitle>On this device</CardTitle>
          <CardDescription>
            {meta
              ? `${meta.origin === "demo" ? "Demo" : "Export"} · ${meta.lastFileName} · ${formatTokyoStamp(meta.lastImportAt)}`
              : "No import yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Count label="Nights" value={nights.length.toLocaleString()} />
          <Count label="SpO2 under 92%" value={lows.length.toLocaleString()} />
          {METRIC_ORDER.map((metric) => (
            <Count key={metric} label={METRICS[metric].short} value={(counts[metric] ?? 0).toLocaleString()} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Dated markers such as “Started Epitalon course” draw a vertical line on every chart.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!date || !label.trim()) return;
              void addAnnotation(date, label).then(() => setLabel(""));
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="event-date">Date</Label>
              <Input id="event-date" type="date" className="h-11" value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-label">Label</Label>
              <Input
                id="event-label"
                className="h-11"
                maxLength={80}
                placeholder="Started Epitalon course"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="h-11" disabled={busy}>
              Add event
            </Button>
          </form>
          {annotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="divide-y">
              {annotations.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="text-muted-foreground">{formatDay(item.date)}</span> · {item.label}
                  </span>
                  <Button type="button" variant="ghost" onClick={() => void removeAnnotation(item.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clear everything</CardTitle>
          <CardDescription>Deletes samples, nights, low readings, and events from this browser. This cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" className="h-11" onClick={() => setConfirmClear(true)} disabled={busy}>
            Clear all data
          </Button>
        </CardContent>
      </Card>
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the on-device record?</DialogTitle>
            <DialogDescription>
              Health samples, sleep, events, and the import history will be removed from this browser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmClear(false)}>
              Keep data
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmClear(false);
                void clearAll();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function countMetrics(days: { metric: MetricId; sources: Record<string, { count: number }> }[]): Partial<Record<MetricId, number>> {
  const totals: Partial<Record<MetricId, number>> = {};
  for (const day of days) {
    let n = 0;
    for (const source of Object.values(day.sources)) n += source.count;
    totals[day.metric] = (totals[day.metric] ?? 0) + n;
  }
  return totals;
}
