import {
  ChevronDown,
  CloudRain,
  Filter,
  Layers,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import type { FlightCategory } from "@/lib/weather/types";
import { CATEGORY_META } from "./format";

export type WeatherMapFilters = {
  showMetars: boolean;
  showAirports: boolean;
  showRadar: boolean;
  onlyHazardous: boolean;
  autoRefresh: boolean;
  categories: Record<FlightCategory, boolean>;
};

export function WeatherMapControls({
  query,
  filters,
  loading,
  lastUpdated,
  timeMode,
  onQueryChange,
  onFiltersChange,
  onRefresh,
  onTimeModeChange,
}: {
  query: string;
  filters: WeatherMapFilters;
  loading: boolean;
  lastUpdated: string | null;
  timeMode: "utc" | "local";
  onQueryChange: (value: string) => void;
  onFiltersChange: (value: WeatherMapFilters) => void;
  onRefresh: () => void;
  onTimeModeChange: (value: "utc" | "local") => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setLayersOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLayersOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function patch(next: Partial<WeatherMapFilters>) {
    onFiltersChange({ ...filters, ...next });
  }

  function toggleCategory(category: FlightCategory) {
    patch({
      categories: {
        ...filters.categories,
        [category]: !filters.categories[category],
      },
    });
  }

  const activeCategories = (
    Object.keys(CATEGORY_META) as FlightCategory[]
  ).filter((category) => filters.categories[category]);
  const categoryLabel =
    activeCategories.length === Object.keys(CATEGORY_META).length
      ? "Minden kategória"
      : activeCategories.length
        ? activeCategories.join(", ")
        : "Nincs kategória";

  return (
    <div
      className={`wx-toolbar ${searchOpen ? "is-search-open" : ""}`}
      aria-label="Repülésmeteorológiai térkép vezérlők"
    >
      <button
        type="button"
        className="wx-icon-btn wx-search-toggle"
        onClick={() => setSearchOpen((value) => !value)}
        aria-label={searchOpen ? "Kereső bezárása" : "Kereső megnyitása"}
        aria-pressed={searchOpen}
      >
        {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
      </button>

      <div className="wx-toolbar-search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="ICAO vagy reptér"
          className="h-10 border-white/10 bg-slate-950/55 pl-9 text-white placeholder:text-slate-500"
          aria-label="Reptérkereső név vagy ICAO alapján"
        />
      </div>

      <button
        type="button"
        className={`wx-pill-control ${filters.onlyHazardous ? "is-active" : ""}`}
        onClick={() => patch({ onlyHazardous: !filters.onlyHazardous })}
        aria-pressed={filters.onlyHazardous}
      >
        <Filter className="size-4" />
        <span className="wx-control-label">Kedvezőtlen</span>
      </button>

      <div ref={menuRef} className="wx-layers-menu">
        <button
          type="button"
          className="wx-pill-control"
          onClick={() => setLayersOpen((value) => !value)}
          aria-expanded={layersOpen}
          aria-controls="wx-layer-popover"
        >
          <Layers className="size-4" />
          Rétegek
          <ChevronDown className="size-4" />
        </button>
        {layersOpen ? (
          <div id="wx-layer-popover" className="wx-layer-popover" role="dialog">
            <div className="wx-layer-popover-head">
              <span>Megjelenítés</span>
              <button
                type="button"
                className="wx-icon-btn"
                onClick={() => setLayersOpen(false)}
                aria-label="Rétegpanel bezárása"
              >
                <X className="size-4" />
              </button>
            </div>
            <Toggle
              label="METAR állomások"
              checked={filters.showMetars}
              onChange={(checked) => patch({ showMetars: checked })}
            />
            <Toggle
              label="METAR nélküli repterek"
              checked={filters.showAirports}
              onChange={(checked) => patch({ showAirports: checked })}
            />
            <Toggle
              label="Automatikus frissítés"
              checked={filters.autoRefresh}
              onChange={(checked) => patch({ autoRefresh: checked })}
            />
            <div className="wx-category-menu">
              <span>Kategóriák</span>
              <div>
                {(Object.keys(CATEGORY_META) as FlightCategory[]).map(
                  (category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={`wx-category-chip ${filters.categories[category] ? CATEGORY_META[category].className : ""}`}
                      aria-pressed={filters.categories[category]}
                    >
                      {category}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className={`wx-pill-control ${filters.showRadar ? "is-active" : ""}`}
        onClick={() => patch({ showRadar: !filters.showRadar })}
        aria-pressed={filters.showRadar}
      >
        <CloudRain className="size-4" />
        <span className="wx-control-label">Radar</span>
      </button>

      <button
        type="button"
        className="wx-pill-control wx-category-summary"
        onClick={() => setLayersOpen(true)}
        aria-label={`Aktív repülési kategóriák: ${categoryLabel}`}
      >
        {categoryLabel}
      </button>

      <button
        type="button"
        className="wx-pill-control wx-time-toggle"
        onClick={() => onTimeModeChange(timeMode === "utc" ? "local" : "utc")}
        aria-label="UTC és helyi magyar idő váltása"
      >
        {timeMode === "utc" ? "UTC" : "HU idő"}
      </button>

      <Button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="wx-refresh-btn"
        aria-label="Meteorológiai adatok frissítése"
      >
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        <span className="wx-control-label">Frissítés</span>
      </Button>

      <p className="wx-last-update" aria-live="polite">
        {lastUpdated
          ? `Frissítve ${new Date(lastUpdated).toLocaleTimeString("hu-HU")}`
          : "Nincs friss adat"}
      </p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="wx-toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-sky-400"
      />
    </label>
  );
}
