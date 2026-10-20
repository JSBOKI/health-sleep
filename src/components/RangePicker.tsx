import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHealth } from "@/context/HealthContext";
import { formatDay } from "@/lib/dates";
import { resolveRange } from "@/lib/range";
import type { RangePreset } from "@/lib/types";

const PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "1y", label: "1y" },
  { id: "all", label: "All" },
  { id: "custom", label: "Custom" },
];

export function RangePicker({ first, last }: { first: string; last: string }) {
  const { range, setRange } = useHealth();
  const resolved = resolveRange(range, first, last);
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="lg"
            variant={range.preset === preset.id ? "default" : "outline"}
            className="h-10 shrink-0 rounded-full px-4"
            onClick={() =>
              setRange({
                preset: preset.id,
                start: preset.id === "custom" ? resolved.start : range.start,
                end: preset.id === "custom" ? resolved.end : range.end,
              })
            }
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {range.preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            aria-label="Start date"
            className="h-11"
            min={first}
            max={last}
            value={range.start || resolved.start}
            onChange={(event) => setRange({ ...range, preset: "custom", start: event.target.value })}
          />
          <Input
            type="date"
            aria-label="End date"
            className="h-11"
            min={first}
            max={last}
            value={range.end || resolved.end}
            onChange={(event) => setRange({ ...range, preset: "custom", end: event.target.value })}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {formatDay(resolved.start)} – {formatDay(resolved.end)} · Asia/Tokyo
      </p>
    </div>
  );
}

export function useResolvedRange(first: string, last: string) {
  const { range } = useHealth();
  return resolveRange(range, first, last);
}
