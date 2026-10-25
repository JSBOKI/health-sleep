import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import heart from "@/data/heart.json";

type Val = { group: string; name: string; value: number | string; unit: string; low?: number; high?: number; note?: string };

function flag(v: Val): "high" | "low" | null {
  if (typeof v.value !== "number") return null;
  if (v.high != null && v.value > v.high) return "high";
  if (v.low != null && v.value < v.low) return "low";
  return null;
}
const ref = (v: Val) => (v.low != null && v.high != null ? `${v.low}–${v.high}` : v.high != null ? `≤ ${v.high}` : v.low != null ? `≥ ${v.low}` : "–");

export function HeartPage() {
  const echo = heart.echo[heart.echo.length - 1];
  const hol = heart.holter[heart.holter.length - 1];
  const ecg = heart.ecg[heart.ecg.length - 1];
  const vals = echo.values as Val[];
  const timeline = [
    { date: echo.date, title: "Transthoracic echo", notes: echo.summary, past: true },
    { date: hol.start.slice(0, 10), title: "Holter (≈4 days)", notes: hol.plain, past: true },
    { date: ecg.date.slice(0, 10), title: "Resting 12-lead ECG", notes: `HR ${ecg.hr} bpm`, past: true },
    ...heart.upcoming.map((u) => ({ date: u.date, title: `${u.time} ${u.title}`, notes: u.notes, past: false })),
  ];
  const cards = [
    { label: "Aortic root", value: "38 mm", sub: "ref 25–35 · mildly dilated", warn: true },
    { label: "LVEF", value: "60–66%", sub: "Simpson / Teichholz", warn: false },
    { label: "Holter mean HR", value: `${hol.hr.mean} bpm`, sub: `min ${hol.hr.min} · max ${hol.hr.max}`, warn: false },
    { label: "Ectopy / AF", value: "~0%", sub: `PVC ${hol.pvc.total} · PAC ${hol.pac.total} · AF 0`, warn: false },
    { label: "Resting ECG HR", value: `${ecg.hr} bpm`, sub: ecg.date.slice(0, 10), warn: false },
    { label: "Next test", value: "12 May 2027", sub: "Echo 10:00 + Holter 10:30", warn: false },
  ];
  return (
    <div className="space-y-5 text-base leading-relaxed" id="heart">
      <div>
        <h1 className="font-heading text-3xl">Heart</h1>
        <p className="text-muted-foreground">{heart.facility} · {heart.cardiologist}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className={c.warn ? "border-amber-500" : ""}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className={`font-heading text-2xl tabular-nums ${c.warn ? "text-amber-500" : ""}`}>{c.value}</p>
              <p className="text-sm text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card id="echo">
        <CardHeader>
          <CardTitle className="text-xl">Echocardiogram · {echo.date}</CardTitle>
          <CardDescription className="text-base">{echo.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead><tr className="border-b text-left text-sm text-muted-foreground"><th className="py-2">Parameter</th><th>Value</th><th>Ref</th><th></th></tr></thead>
              <tbody>
                {vals.map((v) => {
                  const f = flag(v);
                  return (
                    <tr key={v.name} className="border-b border-border/50">
                      <td className="py-2"><span className="text-sm text-muted-foreground">{v.group} · </span>{v.name}{v.note && <span className="block text-sm text-muted-foreground">{v.note}</span>}</td>
                      <td className={`tabular-nums ${f ? "font-semibold text-amber-500" : ""}`}>{v.value} {v.unit}</td>
                      <td className="tabular-nums text-muted-foreground">{ref(v)}</td>
                      <td>{f && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-sm text-amber-500">{f === "high" ? "▲ High" : "▼ Low"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="list-disc pl-5">{echo.findings.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="rounded-lg bg-muted p-3">Plain note: {echo.plain}</p>
          <p className="text-sm text-muted-foreground">LAVI / E/e′ upper limits are standard ASE cut-offs (not printed on report).</p>
        </CardContent>
      </Card>

      <Card id="holter">
        <CardHeader>
          <CardTitle className="text-xl">Holter · {hol.start} → {hol.end}</CardTitle>
          <CardDescription className="text-base">Recorded {hol.recorded} · analysed {hol.analysed} · noise {hol.noisePct}%</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 tabular-nums">
            <div><p className="text-sm text-muted-foreground">HR max</p><p className="text-xl">{hol.hr.max} bpm</p><p className="text-sm text-muted-foreground">{hol.hr.maxAt}</p></div>
            <div><p className="text-sm text-muted-foreground">HR mean</p><p className="text-xl">{hol.hr.mean} bpm</p></div>
            <div><p className="text-sm text-muted-foreground">HR min</p><p className="text-xl">{hol.hr.min} bpm</p><p className="text-sm text-muted-foreground">{hol.hr.minAt}</p></div>
            <div><p className="text-sm text-muted-foreground">Total beats</p><p className="text-xl">{hol.totalBeats.toLocaleString()}</p></div>
          </div>
          <ul className="list-disc pl-5">
            <li>Pauses ≥ 2.0 s: {hol.pauses2s}; longest R-R {hol.longestRR}</li>
            <li>PVC: {hol.pvc.total} isolated, couplets/runs 0, burden {hol.pvc.burden} ({hol.pvc.note})</li>
            <li>PAC: {hol.pac.total} isolated, runs 0, burden {hol.pac.burden}</li>
            <li>AF: {hol.af.beats} beats, burden {hol.af.burden}</li>
          </ul>
          <p className="rounded-lg bg-muted p-3">Plain note: {hol.plain}</p>
          <p className="rounded-lg border border-dashed p-3 text-sm">✍️ {hol.handwritten}</p>
          <p className="text-sm"><a className="text-primary underline" href="#/synced">Compare with daily resting HR from iPhone sync →</a></p>
        </CardContent>
      </Card>

      <Card id="ecg">
        <CardHeader>
          <CardTitle className="text-xl">Resting 12-lead ECG · {ecg.date}</CardTitle>
          <CardDescription className="text-base">{ecg.device} · HR {ecg.hr} bpm · machine read: {ecg.machineRead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>{ecg.read}</p>
          <p className="rounded-lg border border-amber-500 p-3 font-semibold text-amber-500">⚠ {ecg.caveat}</p>
        </CardContent>
      </Card>

      <Card id="timeline">
        <CardHeader><CardTitle className="text-xl">Timeline</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3 border-l pl-4">
            {timeline.map((t) => (
              <li key={t.date + t.title}>
                <p className={`text-sm tabular-nums ${t.past ? "text-muted-foreground" : "font-semibold text-primary"}`}>{t.date}{t.past ? "" : " · upcoming"}</p>
                <p className="font-medium">{t.title}</p>
                <p className="text-sm text-muted-foreground">{t.notes}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">Physiology lab {heart.phones.physiologyLab} · Reservations {heart.phones.reservations}</p>
        </CardContent>
      </Card>
    </div>
  );
}
