import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { formatDay } from "@/lib/dates";

export interface ChartLine {
  name: string;
  color: string;
  width?: number;
  values: Array<number | null>;
}

export interface ChartAnnotation {
  date: string;
  label: string;
}

interface Props {
  dates: string[];
  lines: ChartLine[];
  band?: { min: Array<number | null>; max: Array<number | null>; color: string };
  annotations?: ChartAnnotation[];
  references?: Array<{ value: number; label: string; color: string }>;
  formatValue: (value: number) => string;
  yInclude?: [number, number];
  ariaLabel: string;
  heightClass?: string;
}

interface Layout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  yMin: number;
  yMax: number;
}

function finite(values: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const value of values) if (value != null && Number.isFinite(value)) out.push(value);
  return out;
}

function niceStep(span: number, count: number): number {
  if (!(span > 0)) return 1;
  const rough = span / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const err = rough / mag;
  if (err >= 7.5) return 10 * mag;
  if (err >= 3.5) return 5 * mag;
  if (err >= 1.5) return 2 * mag;
  return mag;
}

function pathFor(values: Array<number | null>, xAt: (index: number) => number, yAt: (value: number) => number): Path2D[] {
  const paths: Path2D[] = [];
  let path: Path2D | null = null;
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      path = null;
      return;
    }
    const x = xAt(index);
    const y = yAt(value);
    if (!path) {
      path = new Path2D();
      path.moveTo(x, y);
      paths.push(path);
    } else path.lineTo(x, y);
  });
  return paths;
}

export function SeriesChart({
  dates,
  lines,
  band,
  annotations = [],
  references = [],
  formatValue,
  yInclude,
  ariaLabel,
  heightClass = "h-56 sm:h-72",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const labelId = useId();
  const hasData = lines.some((line) => finite(line.values).length > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 10 || height < 10) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const layout: Layout = {
        left: 48,
        right: 12,
        top: 16,
        bottom: 28,
        width,
        height,
        yMin: 0,
        yMax: 1,
      };
      const samples = [
        ...lines.flatMap((line) => finite(line.values)),
        ...finite(band?.min ?? []),
        ...finite(band?.max ?? []),
        ...references.map((ref) => ref.value),
      ];
      if (yInclude) samples.push(yInclude[0], yInclude[1]);
      let yMin = samples.length ? Math.min(...samples) : 0;
      let yMax = samples.length ? Math.max(...samples) : 1;
      if (yMax - yMin < 1e-6) {
        yMin -= 1;
        yMax += 1;
      }
      const pad = (yMax - yMin) * 0.08;
      yMin -= pad;
      yMax += pad;
      layout.yMin = yMin;
      layout.yMax = yMax;
      layoutRef.current = layout;

      const n = Math.max(dates.length, 1);
      const innerW = width - layout.left - layout.right;
      const innerH = height - layout.top - layout.bottom;
      const xAt = (index: number) => layout.left + (n === 1 ? innerW / 2 : (index / (n - 1)) * innerW);
      const yAt = (value: number) => layout.top + ((yMax - value) / (yMax - yMin)) * innerH;

      ctx.font = "11px IBM Plex Sans, Geist, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#93a0b4";
      ctx.strokeStyle = "rgba(146, 160, 180, 0.16)";
      ctx.lineWidth = 1;
      const step = niceStep(yMax - yMin, 4);
      const tickStart = Math.ceil(yMin / step) * step;
      for (let value = tickStart; value <= yMax + step * 0.01; value += step) {
        const y = yAt(value);
        ctx.beginPath();
        ctx.moveTo(layout.left, y);
        ctx.lineTo(width - layout.right, y);
        ctx.stroke();
        ctx.fillText(formatValue(value), layout.left - 6, y);
      }

      const labelCount = Math.min(4, dates.length);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      if (dates.length) {
        for (let i = 0; i < labelCount; i++) {
          const index = labelCount === 1 ? 0 : Math.round((i * (dates.length - 1)) / (labelCount - 1));
          const date = dates[index];
          if (!date) continue;
          ctx.fillText(formatDay(date).replace(/ \d{4}$/, ""), xAt(index), height - layout.bottom + 8);
        }
      }

      if (band) {
        ctx.beginPath();
        let open = false;
        let started = -1;
        const close = (end: number) => {
          for (let i = end; i >= started; i--) {
            const lo = band.min[i];
            if (lo == null) continue;
            ctx.lineTo(xAt(i), yAt(lo));
          }
          ctx.closePath();
        };
        band.max.forEach((hi, index) => {
          const lo = band.min[index];
          if (hi == null || lo == null) {
            if (open) close(index - 1);
            open = false;
            return;
          }
          if (!open) {
            ctx.moveTo(xAt(index), yAt(hi));
            started = index;
            open = true;
          } else ctx.lineTo(xAt(index), yAt(hi));
        });
        if (open) close(band.max.length - 1);
        ctx.fillStyle = band.color;
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (const ref of references) {
        const y = yAt(ref.value);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = ref.color;
        ctx.beginPath();
        ctx.moveTo(layout.left, y);
        ctx.lineTo(width - layout.right, y);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = ref.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(ref.label, layout.left + 4, y - 2);
      }

      const marks = annotations
        .map((item) => ({ ...item, index: dates.indexOf(item.date) }))
        .filter((item) => item.index >= 0);
      marks.forEach((mark) => {
        const x = xAt(mark.index);
        ctx.strokeStyle = "rgba(240, 180, 41, 0.85)";
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, layout.top);
        ctx.lineTo(x, height - layout.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f0b429";
        ctx.beginPath();
        ctx.moveTo(x, layout.top);
        ctx.lineTo(x - 4, layout.top + 7);
        ctx.lineTo(x + 4, layout.top + 7);
        ctx.fill();
      });

      for (const line of lines) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width ?? 1.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (const path of pathFor(line.values, xAt, yAt)) ctx.stroke(path);
      }

      if (hover != null && dates[hover]) {
        const x = xAt(hover);
        ctx.strokeStyle = "rgba(232, 238, 246, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, layout.top);
        ctx.lineTo(x, height - layout.bottom);
        ctx.stroke();
        for (const line of lines) {
          const value = line.values[hover];
          if (value == null) continue;
          ctx.fillStyle = line.color;
          ctx.beginPath();
          ctx.arc(x, yAt(value), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    draw();
    return () => observer.disconnect();
  }, [annotations, ariaLabel, band, dates, formatValue, hover, lines, references, yInclude]);

  const onPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout || dates.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const inner = layout.width - layout.left - layout.right;
    const ratio = inner <= 0 ? 0 : (x - layout.left) / inner;
    const index = dates.length === 1 ? 0 : Math.round(Math.min(1, Math.max(0, ratio)) * (dates.length - 1));
    setHover(index);
  };

  const hoverDate = hover != null ? dates[hover] : null;
  const hoverBits =
    hover == null
      ? []
      : lines
          .map((line) => {
            const value = line.values[hover];
            return value == null ? null : { name: line.name, color: line.color, text: formatValue(value) };
          })
          .filter((bit): bit is { name: string; color: string; text: string } => bit != null);
  const hoverNote = annotations.find((item) => item.date === hoverDate);

  return (
    <div className="space-y-2">
      <div className={`relative ${heightClass}`}>
        {hasData ? (
          <canvas
            ref={canvasRef}
            role="img"
            aria-labelledby={labelId}
            className="h-full w-full touch-pan-y"
            onPointerMove={onPointer}
            onPointerLeave={() => setHover(null)}
          />
        ) : (
          <div className="grid h-full place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No samples in this range.
          </div>
        )}
        <span id={labelId} className="sr-only">
          {ariaLabel}
        </span>
        {hoverDate && hoverBits.length > 0 && (
          <div className="pointer-events-none absolute top-2 left-14 z-10 max-w-[14rem] rounded-lg bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10">
            <div className="font-medium">{formatDay(hoverDate)}</div>
            {hoverBits.map((bit) => (
              <div key={bit.name} className="flex items-center justify-between gap-3 tabular-nums">
                <span className="text-muted-foreground">{bit.name}</span>
                <span style={{ color: bit.color }}>{bit.text}</span>
              </div>
            ))}
            {hoverNote && <div className="mt-1 text-amber-300">{hoverNote.label}</div>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {band && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: band.color, opacity: 0.45 }} />
            Min–max
          </span>
        )}
        {lines.map((line) => (
          <span key={line.name} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded" style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
        {references.map((ref) => (
          <span key={ref.label} className="inline-flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed" style={{ borderColor: ref.color }} />
            {ref.label}
          </span>
        ))}
        {annotations.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-amber-300">▲</span>
            Event
          </span>
        )}
      </div>
    </div>
  );
}
