/* eslint-disable react-refresh/only-export-components */
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "firebase/auth";
import "./styles.css";
import { AuthPanel } from "../AuthPanel";
import { BriefingPanel } from "../BriefingPanel";
import AircraftsPanel from "@/flightlogger/AircraftsPanel";
import FlightLoggerPanel from "@/flightlogger/FlightLoggerPanel";
import { NotamPanel } from "../NotamPanel";
import { PlannerPanel, type RouteStats } from "../PlannerPanel";
import { WeatherPanel } from "../WeatherPanel";
import { WbPanel } from "../WbPanel";
import {
  CalendarDays,
  CloudSun,
  FileText,
  FileWarning,
  Map,
  Menu,
  Plane,
  Scale,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FlightPlanSnapshot } from "@/lib/vfr/briefing";
import type { WaypointMeta } from "@/lib/vfr/nav";
import { registerServiceWorker } from "./registerServiceWorker";

type ViewId =
  | "planner"
  | "briefing"
  | "weather"
  | "notams"
  | "wb"
  | "flightlogger"
  | "aircrafts";

const navItems: Array<{
  id: ViewId;
  href: `#${ViewId}`;
  label: string;
  icon: LucideIcon;
  isNew?: boolean;
}> = [
  { id: "planner", href: "#planner", label: "Planner", icon: Map },
  {
    id: "briefing",
    href: "#briefing",
    label: "Briefing",
    icon: FileText,
    isNew: true,
  },
  {
    id: "flightlogger",
    href: "#flightlogger",
    label: "FlightLogger",
    icon: CalendarDays,
    isNew: true,
  },
  {
    id: "aircrafts",
    href: "#aircrafts",
    label: "Aircrafts",
    icon: Plane,
    isNew: true,
  },
  {
    id: "weather",
    href: "#weather",
    label: "AVWeather",
    icon: CloudSun,
    isNew: true,
  },
  { id: "notams", href: "#notams", label: "NOTAMs", icon: FileWarning },
  { id: "wb", href: "#wb", label: "Weight & Balance", icon: Scale },
];

function viewFromHash(hash: string): ViewId {
  const id = hash.replace("#", "");
  return navItems.some((item) => item.id === id) ? (id as ViewId) : "planner";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const [stats, setStats] = useState<RouteStats>({
    legs: 0,
    ete: "—",
    fuel: "—",
    wind: "—",
  });
  const [user, setUser] = useState<User | null>(null);
  const [routeWaypoints, setRouteWaypoints] = useState<WaypointMeta[]>([]);
  const [flightPlan, setFlightPlan] = useState<FlightPlanSnapshot | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>(() =>
    viewFromHash(window.location.hash),
  );
  const handleStats = useCallback((next: RouteStats) => setStats(next), []);
  const handleUserChange = useCallback(
    (next: User | null) => setUser(next),
    [],
  );
  const handleWaypointsChange = useCallback(
    (next: WaypointMeta[]) => setRouteWaypoints(next),
    [],
  );
  const handlePlanChange = useCallback(
    (next: FlightPlanSnapshot | null) => setFlightPlan(next),
    [],
  );
  const handleViewChange = useCallback((view: ViewId) => {
    setActiveView(view);
    if (window.location.hash !== `#${view}`) {
      window.history.pushState(null, "", `#${view}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    function onHashChange() {
      setActiveView(viewFromHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden border-b border-border bg-panel lg:block lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-[72px] items-center gap-4 border-b border-border px-5">
          <div className="grid size-9 place-items-center rounded-sm bg-primary font-mono text-sm font-semibold text-primary-foreground">
            V
          </div>
          <div className="font-mono text-sm font-semibold uppercase tracking-[0.08em]">
            VFR Tools
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto p-4 lg:block lg:space-y-2 lg:overflow-visible">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  handleViewChange(item.id);
                }}
                className={`flex h-10 shrink-0 items-center gap-3 rounded-sm px-3 font-mono text-xs font-semibold transition-colors ${
                  activeView === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                aria-current={activeView === item.id ? "page" : undefined}
              >
                <Icon className="size-4" />
                {item.label}
                {item.isNew && (
                  <span className="ml-auto rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-primary-foreground">
                    new
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-border bg-panel">
          <div className="relative flex min-h-[64px] items-center justify-between gap-3 border-b border-border px-4 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-sm bg-primary font-mono text-sm font-semibold text-primary-foreground">
                V
              </div>
              <div className="truncate font-mono text-sm font-semibold uppercase tracking-[0.08em]">
                VFR Tools
              </div>
            </div>
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-sm border border-border bg-background text-foreground"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-4 top-[calc(100%+8px)] z-[1000] w-[min(320px,calc(100vw-2rem))] rounded-md border border-border bg-background p-3 shadow-xl">
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={(event) => {
                          event.preventDefault();
                          setMobileMenuOpen(false);
                          handleViewChange(item.id);
                        }}
                        className={`flex h-10 items-center gap-3 rounded-sm px-3 font-mono text-xs font-semibold transition-colors ${
                          activeView === item.id
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        aria-current={
                          activeView === item.id ? "page" : undefined
                        }
                      >
                        <Icon className="size-4" />
                        {item.label}
                        {item.isNew && (
                          <span className="ml-auto rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal text-primary-foreground">
                            new
                          </span>
                        )}
                      </a>
                    );
                  })}
                </nav>
                <div className="mt-3 border-t border-border pt-3">
                  <AuthPanel onUserChange={handleUserChange} className="px-0" />
                </div>
              </div>
            )}
          </div>
          <div className="grid min-h-[72px] grid-cols-2 items-center gap-0 lg:grid-cols-[repeat(4,minmax(120px,1fr))_auto]">
            {[
              ["Route legs", String(stats.legs).padStart(2, "0")],
              ["ETE", stats.ete],
              ["Fuel required", stats.fuel],
              ["Wind", stats.wind],
            ].map(([label, value]) => (
              <div key={label} className="border-r border-border px-5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 truncate font-mono text-sm font-semibold tracking-[0.06em]">
                  {value}
                </p>
              </div>
            ))}
            <AuthPanel
              onUserChange={handleUserChange}
              className="hidden lg:flex"
            />
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 lg:px-8">
          <div hidden={activeView !== "planner"}>
            <PlannerPanel
              onStats={handleStats}
              onWaypointsChange={handleWaypointsChange}
              onPlanChange={handlePlanChange}
              user={user}
            />
          </div>
          <div hidden={activeView !== "briefing"}>
            <BriefingPanel plan={flightPlan} />
          </div>
          <div hidden={activeView !== "weather"}>
            <WeatherPanel />
          </div>
          <div hidden={activeView !== "flightlogger"}>
            <FlightLoggerPanel user={user} />
          </div>
          <div hidden={activeView !== "aircrafts"}>
            <AircraftsPanel user={user} />
          </div>
          <div hidden={activeView !== "notams"}>
            <NotamPanel waypoints={routeWaypoints} />
          </div>
          <div hidden={activeView !== "wb"}>
            <WbPanel />
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

registerServiceWorker();
