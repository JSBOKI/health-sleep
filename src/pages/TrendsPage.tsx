import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useMemo } from "react";
import { RangePicker, useResolvedRange } from "@/components/RangePicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/context/HealthContext";
import {
  analyzeAll,
  buildInsights,
  correlations,
  describeDeviceChanges,
  detectDeviceChanges,
  type MetricTrend,
} from "@/lib/analysis";
import { formatDay } from "@/lib/dates";
import { METRICS, deltaTone, formatMetric, type DeltaTone } from "@/lib/metrics";
import { dataExtent } from "@/lib/range";

export function TrendsPage() {
  const { days, nights, lows, annotations } = useHealth();
  const extent = dataExtent(days, nights);
  const bounds = useResolvedRange(extent?.first ?? "2023-01-01", extent?.last ?? "2026-10-18");
  const { start, end } = bounds;
  const trends = useMemo(() => analyzeAll(days, { start, end }), [days, start, end]);
  const corrs = useMemo(() => correlations(days, nights, { start, end }), [days, nights, start, end]);
  const changes = useMemo(() => detectDeviceChanges(days), [days]);
  const note = describeDeviceChanges(changes, { start, end });
  const insights = useMemo(
    () => buildInsights(trends, corrs, nights, lows, { start, end }),
    [trends, corrs, nights, lows, start, end],
  );
  const outliers = trends.flatMap((trend) =>
    trend.outliers.map((outlier) => ({ ...outlier, metric: trend.metric })),
  );
  outliers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const empty = days.length === 0 && nights.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Trends</h1>
        <p className="text-sm text-muted-foreground">
          Slope is a straight line through the daily values. “Meaningful” means a Mann–Kendall test with p below 0.05 and at least 14 days.
        </p>
      </div>
      {empty ? (
        <Card>
          <CardHeader>
            <CardTitle>No record yet</CardTitle>
            <CardDescription>Import an export or load demo data to compute trends.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <RangePicker first={extent?.first ?? bounds.start} last={extent?.last ?? bounds.end} />
          {note && (
            <p
              className={
                note.spansRange
                  ? "rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
                  : "rounded-lg border px-3 py-2 text-sm text-muted-foreground"
              }
            >
              {note.text}
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>What the numbers are doing</CardTitle>
              <CardDescription>Descriptive only. Not medical advice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="list-disc space-y-2 pl-4 text-sm">
                {insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                These notes only describe patterns in the numbers stored on this device. They are not medical advice, a diagnosis, or a reason to change treatment.
              </p>
              {annotations.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Events in view:{" "}
                  {annotations
                    .filter((item) => item.date >= bounds.start && item.date <= bounds.end)
                    .map((item) => `${formatDay(item.date)} ${item.label}`)
                    .join(" · ") || "none in this range"}
                </p>
              )}
            </CardContent>
          </Card>
          <div className="space-y-2">
            {trends.map((trend) => (
              <TrendRow key={trend.metric} trend={trend} />
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Correlations</CardTitle>
              <CardDescription>Pearson r on paired days inside the range. A link here is not a cause.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {corrs.map((corr) => (
                <div key={corr.id} className="rounded-lg bg-muted/40 px-3 py-3">
                  <div className="text-sm font-medium">{corr.label}</div>
                  <div className="mt-1 font-heading text-2xl tabular-nums">
                    {corr.n < 3 ? "—" : corr.r.toFixed(2)}
                    <span className="ml-2 font-sans text-xs text-muted-foreground">
                      {corr.n < 3 ? "need more days" : `p ${corr.p < 0.001 ? "< 0.001" : corr.p.toFixed(3)} · n ${corr.n}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{corr.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Outside the 30-day baseline</CardTitle>
              <CardDescription>Days more than 2 standard deviations from the previous 30 days of that metric.</CardDescription>
            </CardHeader>
            <CardContent>
              {outliers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outliers in this range.</p>
              ) : (
                <ul className="divide-y">
                  {outliers.slice(0, 12).map((outlier) => (
                    <li key={`${outlier.metric}-${outlier.date}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span>
                        {METRICS[outlier.metric].short}
                        <span className="block text-xs text-muted-foreground">{formatDay(outlier.date)}</span>
                      </span>
                      <span className="text-right tabular-nums">
                        {formatMetric(outlier.metric, outlier.value)} {METRICS[outlier.metric].unit}
                        <span className="block text-xs text-muted-foreground">z {outlier.z.toFixed(1)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TrendRow({ trend }: { trend: MetricTrend }) {
  const info = METRICS[trend.metric];
  const tone: DeltaTone = trend.direction === "flat" ? "neutral" : deltaTone(trend.metric, trend.slopePerWeek);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium">{info.label}</div>
          <div className="text-xs text-muted-foreground">{trend.n.toLocaleString()} days</div>
        </div>
        <div className="flex items-center gap-2">
          {tone === "good" && <ArrowUp className="size-4 text-emerald-400" />}
          {tone === "bad" && <ArrowDown className="size-4 text-rose-400" />}
          {tone === "neutral" && <Minus className="size-4 text-muted-foreground" />}
          <div>
            <div className="tabular-nums">
              {trend.direction === "flat" ? "No clear trend" : `${formatMetric(trend.metric, trend.slopePerWeek, true)} ${info.unit}/week`}
            </div>
            <div className="text-xs text-muted-foreground">
              {trend.meaningful ? "Meaningful" : "Not meaningful"} · p {trend.p < 0.001 ? "< 0.001" : trend.p.toFixed(3)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:text-right">
          <div>
            <div className="text-xs text-muted-foreground">Week over week</div>
            <div className="tabular-nums">{trend.wow.delta == null ? "—" : formatMetric(trend.metric, trend.wow.delta, true)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Month over month</div>
            <div className="tabular-nums">{trend.mom.delta == null ? "—" : formatMetric(trend.metric, trend.mom.delta, true)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
