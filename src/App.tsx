import { useEffect, useState } from "react";
import { Shell, type AppRoute } from "@/components/Shell";
import { HealthProvider } from "@/context/HealthContext";
import { METRICS } from "@/lib/metrics";
import type { MetricId } from "@/lib/types";
import { DataPage } from "@/pages/DataPage";
import { MetricDetail } from "@/pages/MetricDetail";
import { Overview } from "@/pages/Overview";
import { SleepPage } from "@/pages/SleepPage";
import { TrendsPage } from "@/pages/TrendsPage";

function parseHash(): AppRoute {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const metric = /^\/metric\/([a-z0-9]+)/.exec(hash);
  if (metric?.[1] && metric[1] in METRICS) return { name: "metric", metric: metric[1] };
  if (hash.startsWith("/sleep")) return { name: "sleep" };
  if (hash.startsWith("/trends")) return { name: "trends" };
  if (hash.startsWith("/data")) return { name: "data" };
  return { name: "overview" };
}

function titleFor(route: AppRoute): string {
  if (route.name === "metric") return `${METRICS[route.metric as MetricId].label} · Health & Sleep`;
  if (route.name === "sleep") return "Sleep · Health & Sleep";
  if (route.name === "trends") return "Trends · Health & Sleep";
  if (route.name === "data") return "Data · Health & Sleep";
  return "Health & Sleep";
}

function Router() {
  const [route, setRoute] = useState<AppRoute>(() => parseHash());
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  let page = <Overview />;
  if (route.name === "metric") page = <MetricDetail metric={route.metric as MetricId} />;
  else if (route.name === "sleep") page = <SleepPage />;
  else if (route.name === "trends") page = <TrendsPage />;
  else if (route.name === "data") page = <DataPage />;

  return <Shell route={route}>{page}</Shell>;
}

export default function App() {
  return (
    <HealthProvider>
      <Router />
    </HealthProvider>
  );
}
