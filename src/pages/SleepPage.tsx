import { Download } from "lucide-react";
import { useMemo } from "react";
import { RangePicker, useResolvedRange } from "@/components/RangePicker";
import { SeriesChart } from "@/components/SeriesChart";
import { SleepChart } from "@/components/SleepChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/context/HealthContext";
import { describeDeviceChanges, detectDeviceChanges } from "@/lib/analysis";
import { downloadText, sleepCsv } from "@/lib/csv";
import { formatDay, minutesAfter18 } from "@/lib/dates";
import { formatHours } from "@/lib/metrics";
import { dataExtent } from "@/lib/range";
import { alignSleep, clockLabel } from "@/lib/series";
import { average, stdev } from "@/lib/stats";

export function SleepPage() {
  const { nights, days, annotations } = useHealth();
  const extent = dataExtent(days, nights);
  const range = useResolvedRange(extent?.first ?? "2023-01-01", extent?.last ?? "2026-10-18");
  const aligned = useMemo(
    () => alignSleep(nights, range.start, range.end),
    [nights, range.start, range.end],
  );
  const inRange = nights.filter((night) => night.night >= range.start && night.night <= range.end);
  const changes = useMemo(
    () => detectDeviceChanges(days.filter((day) => day.metric === "hr")),
    [days],
  );
  const note = describeDeviceChanges(changes, range);
  const asleep = inRange.map((night) => night.asleepMin);
  const efficiency = inRange.map((night) => night.efficiency).filter((value): value is number => value != null);
  const beds = inRange.filter((night) => night.bedtimeMs != null).map((night) => minutesAfter18(night.bedtimeMs ?? 0));
  const wakes = inRange.filter((night) => night.wakeMs != null).map((night) => minutesAfter18(night.wakeMs ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">Sleep</h1>
          <p className="text-sm text-muted-foreground">
            A night is dated to the evening it starts. Segments before noon stay with the previous evening. Overlapping sources are deduped, preferring Apple Watch.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0"
          disabled={!inRange.length}
          onClick={() => downloadText("sleep-nights.csv", sleepCsv(inRange))}
        >
          <Download />
          CSV
        </Button>
      </div>
      <RangePicker first={extent?.first ?? range.start} last={extent?.last ?? range.end} />
      {note?.spansRange && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Heart-rate sampling changed inside this range, so sleep-stage detail may have changed with the watch. {note.text}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Avg asleep" value={asleep.length ? formatHours(average(asleep)) : "—"} />
        <Tile label="Efficiency" value={efficiency.length ? `${average(efficiency).toFixed(0)}%` : "—"} />
        <Tile label="Bedtime SD" value={beds.length > 2 ? `${Math.round(stdev(beds))} min` : "—"} />
        <Tile label="Wake SD" value={wakes.length > 2 ? `${Math.round(stdev(wakes))} min` : "—"} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stages each night</CardTitle>
          <CardDescription>
            {inRange.length.toLocaleString()} nights
            {inRange.length ? ` · last night ${formatDay(inRange[inRange.length - 1]?.night ?? range.end)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SleepChart
            dates={aligned.dates}
            deep={aligned.deep}
            core={aligned.core}
            rem={aligned.rem}
            unspecified={aligned.unspecified}
            awake={aligned.awake}
            annotations={annotations}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bedtime and wake</CardTitle>
          <CardDescription>
            Average bedtime {beds.length ? clockLabel(average(beds)) : "—"}, average wake{" "}
            {wakes.length ? clockLabel(average(wakes)) : "—"}. Thick lines are 7-day means.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SeriesChart
            dates={aligned.dates}
            lines={[
              { name: "Bedtime", color: "#c4b5fd", width: 1.4, values: aligned.bed },
              { name: "Bedtime 7-day", color: "#8b7cf6", width: 2, values: aligned.bedMa },
              { name: "Wake", color: "#f0b429", width: 1.4, values: aligned.wake },
              { name: "Wake 7-day", color: "#f6d98a", width: 2, values: aligned.wakeMa },
            ]}
            annotations={annotations}
            formatValue={(value) => clockLabel(value)}
            ariaLabel="Bedtime and wake time consistency"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-heading text-xl tabular-nums">{value}</div>
    </div>
  );
}
