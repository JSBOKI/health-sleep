import type { ReactNode } from "react";
import { Database, HeartPulse, LayoutGrid, Moon, Smartphone, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useHealth } from "@/context/HealthContext";
import { formatTokyoStamp } from "@/lib/dates";

export type AppRoute =
  | { name: "overview" }
  | { name: "metric"; metric: string }
  | { name: "sleep" }
  | { name: "trends" }
  | { name: "data" }
  | { name: "heart" }
  | { name: "synced" };

const NAV = [
  { href: "#/", label: "Overview", icon: LayoutGrid, match: (route: AppRoute) => route.name === "overview" || route.name === "metric" },
  { href: "#/sleep", label: "Sleep", icon: Moon, match: (route: AppRoute) => route.name === "sleep" },
  { href: "#/trends", label: "Trends", icon: TrendingUp, match: (route: AppRoute) => route.name === "trends" },
  { href: "#/heart", label: "Heart", icon: HeartPulse, match: (route: AppRoute) => route.name === "heart" },
  { href: "#/synced", label: "Synced", icon: Smartphone, match: (route: AppRoute) => route.name === "synced" },
  { href: "#/data", label: "Data", icon: Database, match: (route: AppRoute) => route.name === "data" },
];

export function Shell({ route, children }: { route: AppRoute; children: ReactNode }) {
  const { progress } = useHealth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const pct =
    progress && progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesRead / progress.bytesTotal) * 100))
      : progress
        ? 100
        : 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-heading text-lg text-primary-foreground">
            J
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-lg leading-tight">Health & Sleep</p>
            <p className="truncate text-xs text-muted-foreground">Jeremy · Flight surgeon · Okinawa</p>
          </div>
          <time className="text-right text-xs leading-tight text-muted-foreground tabular-nums" dateTime={new Date(now).toISOString()}>
            {formatTokyoStamp(now)}
            <span className="block">JST</span>
          </time>
        </div>
        {progress && (
          <div className="mx-auto max-w-5xl px-4 pb-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.phase}
              {progress.bytesTotal > 0 && ` · ${(progress.bytesRead / 1e6).toFixed(1)} / ${(progress.bytesTotal / 1e6).toFixed(0)} MB`}
              {progress.scanned > 0 && ` · ${progress.scanned.toLocaleString()} records`}
              {progress.kept > 0 && ` · ${progress.kept.toLocaleString()} kept`}
            </p>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-5xl grid-cols-6">
          {NAV.map((item) => {
            const active = item.match(route);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
