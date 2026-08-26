import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "firebase/auth";
import "./styles.css";
import { AuthPanel } from "../AuthPanel";
import { NotamPanel } from "../NotamPanel";
import { PlannerPanel, type RouteStats } from "../PlannerPanel";
import { WeatherPanel } from "../WeatherPanel";
import { WbPanel } from "../WbPanel";
import { CloudSun, FileWarning, Map, Menu, Scale, X } from "lucide-react";
import type { WaypointMeta } from "@/lib/vfr/nav";
import { registerServiceWorker } from "./registerServiceWorker";

const navItems = [
  { href: "#planner", label: "Planner", icon: Map, active: true },
  { href: "#weather", label: "AVWeather", icon: CloudSun, isNew: true },
  { href: "#notams", label: "NOTAMs", icon: FileWarning },
  { href: "#wb", label: "Weight & Balance", icon: Scale },
];

function App() {
  const [stats, setStats] = useState<RouteStats>({
    legs: 0,
    ete: "—",
    fuel: "—",
    wind: "—",
  });
  const [user, setUser] = useState<User | null>(null);
  const [routeWaypoints, setRouteWaypoints] = useState<WaypointMeta[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const handleStats = useCallback((next: RouteStats) => setStats(next), []);
  const handleUserChange = useCallback((next: User | null) => setUser(next), []);
  const handleWaypointsChange = useCallback(
    (next: WaypointMeta[]) => setRouteWaypoints(next),
    [],
  );

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
                className={`flex h-10 shrink-0 items-center gap-3 rounded-sm px-3 font-mono text-xs font-semibold transition-colors ${
                  item.active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
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
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
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
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex h-10 items-center gap-3 rounded-sm px-3 font-mono text-xs font-semibold transition-colors ${
                          item.active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
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
            <AuthPanel onUserChange={handleUserChange} className="hidden lg:flex" />
          </div>
        </header>

        <main className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
          <PlannerPanel
            onStats={handleStats}
            onWaypointsChange={handleWaypointsChange}
            user={user}
          />
          <WeatherPanel />
          <NotamPanel waypoints={routeWaypoints} />
          <WbPanel />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();
