import { ArrowLeft, Download } from "lucide-react";
import { useMemo } from "react";
import { SeriesChart } from "@/components/SeriesChart";
import { RangePicker, useResolvedRange } from "@/components/RangePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/context/HealthContext";
import { describeDeviceChanges, detectDeviceChanges, metricSeries } from "@/lib/analysis";
import { dailyCsv, downloadText } from "@/lib/csv";
import { dateKeyFromMs, formatDay, formatTokyoClock } from "@/lib/dates";
import { METRICS, formatMetric } from "@/lib/metrics";
import { dataExtent } from "@/lib/range";
import { alignDaily } from "@/lib/series";
import type { MetricId } from "@/lib/types";

export function MetricDetail({ metric }: { metric: MetricId }) {
  const { days, annotations, lows } = useHealth();
  const info = METRICS[metric];
  const extent = dataExtent(days, []);
  const range = useResolvedRange(extent?.first ?? "2023-01-01", extent?.last ?? "2026-10-18");
  const values = useMemo(() => metricSeries(days, metric), [days, metric]);
  const inRange = values.filter((row) => row.date >= range.start && row.date <= range.end);
  const aligned = useMemo(() => alignDaily(values, range.start, range.end), [values, range.start, range.end]);
  const changes = useMemo(() => detectDeviceChanges(days.filter((day) => day.metric === metric)), [days, metric]);
  const note = describeDeviceChanges(changes, range);
  const lowsInRange =
    metric === "spo2"
      ? lows.filter((low) => {
          const date = dateKeyFromMs(low.timeMs);
          return date >= range.start && date <= range.end;
        })
      : [];
  const samples = inRange.reduce((sum, row) => sum + row.count, 0);
  const mean = inRange.length ? inRange.reduce((sum, row) => sum + row.value, 0) / inRange.length : null;
  const min = inRange.length ? Math.min(...inRange.map((row) => row.value)) : null;
  const max = inRange.length ? Math.max(...inRange.map((row) => row.value)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a href="#/" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="size-4" />
            Overview
          </a>
          <h1 className="font-heading text-2xl tracking-tight">{info.label}</h1>
          <p className="text-sm text-muted-foreground">{info.caption}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0"
          onClick={() => downloadText(`${metric}-daily.csv`, dailyCsv(metric, inRange))}
          disabled={!inRange.length}
        >
          <Download />
          CSV
        </Button>
      </div>
      <RangePicker first={extent?.first ?? range.start} last={extent?.last ?? range.end} />
      {note?.spansRange && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{note.text}</p>
      )}
      <Card>
        <CardHeader>
          <CardDescription>
            {samples.toLocaleString()} samples · {inRange.length.toLocaleString()} days
          </CardDescription>
          <CardTitle className="font-heading text-3xl tabular-nums">
            {mean == null ? "—" : formatMetric(metric, mean)}
            <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{info.unit} mean</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesChart
            dates={aligned.dates}
            lines={[
              { name: "Daily", color: info.color, width: 1.6, values: aligned.value },
              { name: "7-day", color: "#d5deea", width: 1.4, values: aligned.ma7 },
              { name: "30-day", color: "#f0b429", width: 2, values: aligned.ma30 },
            ]}
            band={
              info.band
                ? { min: aligned.min, max: aligned.max, color: info.color }
                : undefined
            }
            annotations={annotations}
            references={
              metric === "spo2"
                ? [
                    { value: 95, label: "95%", color: "#f0b429" },
                    { value: 90, label: "90%", color: "#ff8b7b" },
                  ]
                : []
            }
            yInclude={metric === "spo2" ? [90, 100] : undefined}
            formatValue={(value) => formatMetric(metric, value)}
            ariaLabel={`${info.label} daily series with 7 and 30 day averages`}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Stat label="Min" value={min == null ? "—" : formatMetric(metric, min)} />
            <Stat label="Mean" value={mean == null ? "—" : formatMetric(metric, mean)} />
            <Stat label="Max" value={max == null ? "—" : formatMetric(metric, max)} />
          </div>
        </CardContent>
      </Card>
      {metric === "spo2" && (
        <Card>
          <CardHeader>
            <CardTitle>Readings under 92%</CardTitle>
            <CardDescription>
              {lowsInRange.length.toLocaleString()} in this range. Times are Asia/Tokyo. This list is not medical advice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lowsInRange.length === 0 ? (
              <p className="text-sm text-muted-foreground">No readings under 92% in this range.</p>
            ) : (
              <ul className="max-h-80 divide-y overflow-auto">
                {lowsInRange.slice(0, 100).map((low) => (
                  <li key={low.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span>
                      {formatDay(dateKeyFromMs(low.timeMs))} · {formatTokyoClock(low.timeMs)}
                      <span className="block text-xs text-muted-foreground">{low.device}</span>
                    </span>
                    <span className="font-medium text-rose-300 tabular-nums">{low.value.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            )}
            {lowsInRange.length > 100 && (
              <p className="mt-2 text-xs text-muted-foreground">Showing 100 of {lowsInRange.length}.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
