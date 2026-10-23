import { useCallback, useEffect, useState } from "react";
import { SeriesChart } from "@/components/SeriesChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const API_BASE = "https://health-sleep-api.onrender.com";
const TOKEN_KEY = "health-ingest-token";

interface Day {
  date: string;
  steps?: number;
  active_energy?: number;
  resting_hr?: number;
  avg_hr?: number;
  hrv?: number;
  sleep_hours?: number;
  sleep_start?: string;
  sleep_end?: string;
  weight?: number;
  vo2max?: number;
  workouts?: unknown[];
  updated_at?: string;
}

const CHARTS: Array<{ key: keyof Day; label: string; color: string; fmt: (v: number) => string }> = [
  { key: "sleep_hours", label: "Sleep (h)", color: "#8b9cff", fmt: (v) => `${v.toFixed(1)} h` },
  { key: "resting_hr", label: "Resting HR (bpm)", color: "#ff7a7a", fmt: (v) => `${Math.round(v)} bpm` },
  { key: "hrv", label: "HRV (ms)", color: "#5fd3a5", fmt: (v) => `${Math.round(v)} ms` },
  { key: "steps", label: "Steps", color: "#f5c35b", fmt: (v) => Math.round(v).toLocaleString() },
];

const COLS: Array<[keyof Day, string]> = [
  ["steps", "Steps"], ["active_energy", "kcal"], ["resting_hr", "RHR"], ["avg_hr", "Avg HR"], ["hrv", "HRV"],
  ["sleep_hours", "Sleep h"], ["sleep_start", "Bed"], ["sleep_end", "Wake"], ["weight", "Wt"], ["vo2max", "VO₂"],
];

function cell(v: unknown): string {
  if (v == null) return "–";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return String(v);
}

export function SyncedPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [draft, setDraft] = useState("");
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (tok: string) => {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/health/data`, { headers: { "X-Ingest-Token": tok } });
      if (res.status === 401) throw new Error("Token rejected.");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = (await res.json()) as { days: Day[] };
      setDays(json.days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the API (it may be waking up — retry in 30 s).");
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>iPhone sync</CardTitle>
          <CardDescription>Enter the ingest token once; it stays in this browser only.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="X-Ingest-Token" />
          <Button onClick={() => { localStorage.setItem(TOKEN_KEY, draft.trim()); setToken(draft.trim()); }}>Save</Button>
        </CardContent>
      </Card>
    );
  }

  const recent = (days ?? []).slice(-90);
  const dates = recent.map((d) => d.date);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl">iPhone sync</h1>
          <p className="text-xs text-muted-foreground">Daily values posted by the Apple Shortcuts automation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(token)}>Refresh</Button>
          <Button variant="ghost" size="sm" onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); setDays(null); }}>Forget token</Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {days && days.length === 0 && <p className="text-sm text-muted-foreground">No synced days yet.</p>}
      {recent.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {CHARTS.map((c) => (
              <Card key={c.key}>
                <CardHeader><CardTitle className="text-base">{c.label}</CardTitle></CardHeader>
                <CardContent>
                  <SeriesChart
                    dates={dates}
                    lines={[{ name: c.label, color: c.color, values: recent.map((d) => (typeof d[c.key] === "number" ? (d[c.key] as number) : null)) }]}
                    formatValue={c.fmt}
                    ariaLabel={`${c.label} trend`}
                    heightClass="h-44"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Daily table</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Date</th>
                    {COLS.map(([, l]) => <th key={l} className="py-1 pr-3">{l}</th>)}
                    <th className="py-1">Workouts</th>
                  </tr>
                </thead>
                <tbody>
                  {[...recent].reverse().map((d) => (
                    <tr key={d.date} className="border-t">
                      <td className="py-1 pr-3 whitespace-nowrap">{d.date}</td>
                      {COLS.map(([k]) => <td key={k} className="py-1 pr-3">{cell(d[k])}</td>)}
                      <td className="py-1">{d.workouts?.map((w) => (typeof w === "string" ? w : JSON.stringify(w))).join(", ") ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
