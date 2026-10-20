import { useEffect, useRef, useState } from "react";
import { formatDay, formatDayShort } from "@/lib/dates";
import { formatHours } from "@/lib/metrics";

const LAYERS = [
  { key: "deep", label: "Deep", color: "#3d5afe" },
  { key: "core", label: "Core", color: "#6ea8ff" },
  { key: "rem", label: "REM", color: "#c084fc" },
  { key: "unspecified", label: "Asleep", color: "#7c8ea3" },
  { key: "awake", label: "Awake", color: "#f0b429" },
] as const;

interface Props {
  dates: string[];
  deep: number[];
  core: number[];
  rem: number[];
  unspecified: number[];
  awake: number[];
  annotations: Array<{ date: string; label: string }>;
}

export function SleepChart({ dates, deep, core, rem, unspecified, awake, annotations }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const series = { deep, core, rem, unspecified, awake };
  const totals = dates.map((_, index) => LAYERS.reduce((sum, layer) => sum + (series[layer.key][index] ?? 0), 0));
  const hasData = totals.some((total) => total > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const draw = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const left = 42;
      const right = 8;
      const top = 12;
      const bottom = 26;
      const maxMin = Math.max(8 * 60, ...totals, 1);
      const yMax = maxMin * 1.08;
      const innerW = width - left - right;
      const innerH = height - top - bottom;
      const slot = dates.length ? innerW / dates.length : innerW;
      const yAt = (mins: number) => top + ((yMax - mins) / yMax) * innerH;
      ctx.font = "11px IBM Plex Sans, Geist, sans-serif";
      ctx.fillStyle = "#93a0b4";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(146, 160, 180, 0.16)";
      for (const hour of [0, 2, 4, 6, 8, 10]) {
        if (hour * 60 > yMax) continue;
        const y = yAt(hour * 60);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillText(`${hour}h`, left - 6, y);
      }
      for (let index = 0; index < dates.length; index++) {
        let y = yAt(0);
        for (const layer of LAYERS) {
          const mins = series[layer.key][index] ?? 0;
          if (mins <= 0) continue;
          const topY = yAt(yAtInverse(y, yMax, top, innerH) + mins);
          const h = y - topY;
          ctx.fillStyle = layer.color;
          ctx.fillRect(left + index * slot, topY, Math.max(slot * 0.86, 0.7), Math.max(h, 0.4));
          y = topY;
        }
      }
      for (const mark of annotations) {
        const index = dates.indexOf(mark.date);
        if (index < 0) continue;
        const x = left + index * slot + slot / 2;
        ctx.strokeStyle = "rgba(240, 180, 41, 0.9)";
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, height - bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#93a0b4";
      const ticks = Math.min(4, dates.length);
      for (let i = 0; i < ticks; i++) {
        const index = ticks === 1 ? 0 : Math.round((i * (dates.length - 1)) / (ticks - 1));
        const date = dates[index];
        if (!date) continue;
        ctx.fillText(formatDayShort(date), left + index * slot + slot / 2, height - bottom + 8);
      }
      if (hover != null) {
        const x = left + hover * slot;
        ctx.strokeStyle = "rgba(232, 238, 246, 0.4)";
        ctx.strokeRect(x, top, Math.max(slot, 1), innerH);
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    draw();
    return () => observer.disconnect();
  }, [annotations, awake, core, dates, deep, hover, rem, series, totals, unspecified]);

  const night = hover != null ? dates[hover] : null;
  const note = annotations.find((item) => item.date === night);

  return (
    <div className="space-y-2">
      <div className="relative h-56 sm:h-72">
        {hasData ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-pan-y"
            role="img"
            aria-label="Stacked sleep stages per night"
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left - 42;
              const inner = rect.width - 50;
              if (inner <= 0 || dates.length === 0) return;
              const index = Math.min(dates.length - 1, Math.max(0, Math.floor((x / inner) * dates.length)));
              setHover(index);
            }}
            onPointerLeave={() => setHover(null)}
          />
        ) : (
          <div className="grid h-full place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No nights in this range.
          </div>
        )}
        {night && (totals[hover ?? 0] ?? 0) > 0 && (
          <div className="pointer-events-none absolute top-2 right-2 z-10 rounded-lg bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10">
            <div className="font-medium">{formatDay(night)}</div>
            <div className="tabular-nums">{formatHours(totals[hover ?? 0] ?? 0)} in the stack</div>
            {LAYERS.map((layer) => {
              const mins = series[layer.key][hover ?? 0] ?? 0;
              if (mins <= 0) return null;
              return (
                <div key={layer.key} className="flex justify-between gap-3 tabular-nums">
                  <span style={{ color: layer.color }}>{layer.label}</span>
                  <span>{formatHours(mins)}</span>
                </div>
              );
            })}
            {note && <div className="mt-1 text-amber-300">{note.label}</div>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {LAYERS.map((layer) => (
          <span key={layer.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: layer.color }} />
            {layer.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function yAtInverse(y: number, yMax: number, top: number, innerH: number): number {
  return yMax - ((y - top) / innerH) * yMax;
}
