import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHealth } from "@/context/HealthContext";
import { fixedWindows } from "@/lib/analysis";
import { addDays, formatDay } from "@/lib/dates";
import {
  METRICS,
  METRIC_ORDER,
  deltaTone,
  formatHours,
  formatMetric,
  type DeltaTone,
} from "@/lib/metrics";
import { metricSeries } from "@/lib/analysis";
import { windowMean } from "@/lib/stats";
import type { MetricId } from "@/lib/types";

export function Overview() {
  const { days, nights, meta, openImport, loadDemo, busy } = useHealth();
  const empty = days.length === 0 && nights.length === 0;
  const lastNight = nights[nights.length - 1];
  const asOf = lastDate(days.map((day) => day.date).concat(nights.map((night) => night.night)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {empty
            ? "Nothing is stored on this device yet."
            : asOf
              ? `Latest day in the record is ${formatDay(asOf)}. Averages end on each metric’s own last sample.`
              : "On-device record"}
          {meta?.origin === "demo" ? " Showing demo data." : ""}
        </p>
      </div>
      {empty && (
        <Card>
          <CardHeader>
            <CardTitle>Bring in an Apple Health export</CardTitle>
            <CardDescription>
              Pick export.zip or the export.xml inside it. Parsing stays in a worker on this phone. The file is never uploaded.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="h-11" onClick={openImport} disabled={busy}>
              Choose export
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => void loadDemo()} disabled={busy}>
              Load demo data
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SleepCard />
        {METRIC_ORDER.map((metric) => (
          <MetricCard key={metric} metric={metric} />
        ))}
      </div>
      {!empty && lastNight && (
        <p className="text-xs text-muted-foreground">
          Sleep nights are dated to the evening they start. Green and red arrows follow the usual direction for that metric. They are not a judgment about your health.
        </p>
      )}
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricId }) {
  const { days } = useHealth();
  const values = metricSeries(days, metric);
  const stats = fixedWindows(values);
  const info = METRICS[metric];
  const spark = sparkValues(values);
  return (
    <a href={`#/metric/${metric}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full transition-colors hover:bg-muted/30">
        <CardHeader>
          <CardDescription>{info.label}</CardDescription>
          <CardTitle className="font-heading text-3xl tabular-nums tracking-tight">
            {stats.latest ? formatMetric(metric, stats.latest.value) : "—"}
            <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{info.unit}</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {stats.latest ? formatDay(stats.latest.date) : "No samples"}
            {stats.latest?.device ? ` · ${stats.latest.device}` : ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Sparkline values={spark} color={info.color} />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Mini label="7-day" value={stats.avg7 == null ? "—" : formatMetric(metric, stats.avg7)} />
            <Mini label="30-day" value={stats.avg30 == null ? "—" : formatMetric(metric, stats.avg30)} />
          </div>
          <Delta metric={metric} delta={stats.delta30} />
        </CardContent>
      </Card>
    </a>
  );
}

function SleepCard() {
  const { nights } = useHealth();
  const latest = nights[nights.length - 1];
  const end = latest?.night;
  const avg7 = end ? meanAsleep(nights, addDays(end, -6), end) : null;
  const avg30 = end ? meanAsleep(nights, addDays(end, -29), end) : null;
  const prior = end ? meanAsleep(nights, addDays(end, -59), addDays(end, -30)) : null;
  const delta = avg30 != null && prior != null ? avg30 - prior : null;
  const spark = end
    ? Array.from({ length: 30 }, (_, index) => {
        const date = addDays(end, index - 29);
        const night = nights.find((item) => item.night === date);
        return night ? night.asleepMin / 60 : null;
      })
    : [];
  return (
    <a href="#/sleep" className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full transition-colors hover:bg-muted/30">
        <CardHeader>
          <CardDescription>Sleep</CardDescription>
          <CardTitle className="font-heading text-3xl tabular-nums tracking-tight">
            {latest ? formatHours(latest.asleepMin) : "—"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {latest
              ? `${formatDay(latest.night)} · ${latest.efficiency == null ? "efficiency n/a" : `${Math.round(latest.efficiency)}% efficient`}`
              : "No nights"}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Sparkline values={spark} color="#8eb6ff" />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Mini label="7-day" value={avg7 == null ? "—" : formatHours(avg7)} />
            <Mini label="30-day" value={avg30 == null ? "—" : formatHours(avg30)} />
          </div>
          <p className="flex items-center gap-1 text-sm">
            <ToneIcon tone={sleepTone(delta)} />
            <span className={toneClass(sleepTone(delta))}>
              {delta == null ? "Not enough nights" : `${delta > 0 ? "+" : ""}${formatHours(delta)}`}
            </span>
            <span className="text-muted-foreground">vs prior 30 days</span>
          </p>
        </CardContent>
      </Card>
    </a>
  );
}

function meanAsleep(nights: { night: string; asleepMin: number }[], start: string, end: string): number | null {
  return windowMean(
    nights.filter((night) => night.asleepMin > 0).map((night) => ({ date: night.night, value: night.asleepMin })),
    start,
    end,
  );
}

function sleepTone(delta: number | null): DeltaTone {
  if (delta == null || Math.abs(delta) < 8) return "neutral";
  return delta > 0 ? "good" : "bad";
}

function Delta({ metric, delta }: { metric: MetricId; delta: number | null }) {
  const tone = delta == null ? "neutral" : deltaTone(metric, delta);
  return (
    <p className="flex items-center gap-1 text-sm">
      <ToneIcon tone={tone} />
      <span className={toneClass(tone)}>
        {delta == null ? "Not enough days" : formatMetric(metric, delta, true)}
      </span>
      <span className="text-muted-foreground">vs prior 30 days</span>
    </p>
  );
}

function ToneIcon({ tone }: { tone: DeltaTone }) {
  if (tone === "good") return <ArrowUp className="size-3.5 text-emerald-400" aria-hidden="true" />;
  if (tone === "bad") return <ArrowDown className="size-3.5 text-rose-400" aria-hidden="true" />;
  return <Minus className="size-3.5 text-muted-foreground" aria-hidden="true" />;
}

function toneClass(tone: DeltaTone): string {
  if (tone === "good") return "text-emerald-400";
  if (tone === "bad") return "text-rose-400";
  return "text-muted-foreground";
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function Sparkline({ values, color }: { values: Array<number | null>; color: string }) {
  const nums = values.filter((value): value is number => value != null);
  if (nums.length < 2) return <div className="h-9" />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const w = 120;
  const h = 36;
  let d = "";
  values.forEach((value, index) => {
    if (value == null) return;
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * w;
    const y = h - 2 - ((value - min) / span) * (h - 6);
    d += d ? `L${x.toFixed(1)} ${y.toFixed(1)} ` : `M${x.toFixed(1)} ${y.toFixed(1)} `;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function sparkValues(values: { date: string; value: number }[]): Array<number | null> {
  const last = values[values.length - 1];
  if (!last) return [];
  const byDate = new Map(values.map((row) => [row.date, row.value]));
  return Array.from({ length: 30 }, (_, index) => byDate.get(addDays(last.date, index - 29)) ?? null);
}

function lastDate(dates: string[]): string | null {
  let last = "";
  for (const date of dates) if (date > last) last = date;
  return last || null;
}
