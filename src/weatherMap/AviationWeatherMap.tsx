import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Airport } from "@/lib/vfr/nav";
import type { FlightCategory, WeatherStation } from "@/lib/weather/types";
import { clearWeatherCache, fetchWeatherStations } from "@/lib/weather/client";
import { StationMarkers } from "./StationMarkers";
import { RadarLayer } from "./RadarLayer";
import {
  WeatherMapControls,
  type WeatherMapFilters,
} from "./WeatherMapControls";
import { WeatherDetailPanel } from "./WeatherDetailPanel";
import { stationSearchText, CATEGORY_META } from "./format";

const HUNGARY_BOUNDS: [[number, number], [number, number]] = [
  [45.7, 16],
  [48.7, 23],
];

const DEFAULT_FILTERS: WeatherMapFilters = {
  showMetars: true,
  showAirports: false,
  showRadar: false,
  onlyHazardous: false,
  autoRefresh: false,
  categories: {
    VFR: true,
    MVFR: true,
    IFR: true,
    LIFR: true,
    UNKNOWN: true,
  },
};

export function AviationWeatherMap({ airports }: { airports: Airport[] }) {
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<WeatherStation | null>(
    null,
  );
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  const [timeMode, setTimeMode] = useState<"utc" | "local">("utc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  function load(force = false) {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (force) clearWeatherCache();
    fetchWeatherStations({ force, signal: controller.signal })
      .then((response) => {
        setStations(response.stations);
        setLastUpdated(response.generatedAt);
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error ? nextError.message : "Weather API hiba.",
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }

  useEffect(() => {
    const id = window.setTimeout(() => load(false), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    const id = window.setInterval(() => load(true), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [filters.autoRefresh]);

  const filteredStations = useMemo(() => {
    const needle = query
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return stations.filter((station) => {
      if (!filters.showMetars) return false;
      if (!filters.categories[station.category]) return false;
      if (filters.onlyHazardous && station.category === "VFR") return false;
      if (needle && !stationSearchText(station).includes(needle)) return false;
      return true;
    });
  }, [stations, filters, query]);

  return (
    <div className="wx-map-app">
      <WeatherMapControls
        query={query}
        filters={filters}
        loading={loading}
        lastUpdated={lastUpdated}
        timeMode={timeMode}
        onQueryChange={setQuery}
        onFiltersChange={setFilters}
        onRefresh={() => load(true)}
        onTimeModeChange={setTimeMode}
      />

      <div className={`wx-map-layout ${selectedStation ? "has-detail" : ""}`}>
        <div className="wx-map-stage">
          <MapContainer
            bounds={HUNGARY_BOUNDS}
            maxBounds={[
              [44.8, 14.5],
              [49.5, 24.5],
            ]}
            minZoom={6}
            scrollWheelZoom
            className="wx-map"
          >
            <TileLayer
              attribution={
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              }
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitSearch stations={filteredStations} query={query} />
            <InvalidateOnLayout selectedIcao={selectedStation?.icao ?? null} />
            <RadarLayer enabled={filters.showRadar} />
            <StationMarkers
              stations={filteredStations}
              airports={airports}
              showAirports={filters.showAirports}
              timeMode={timeMode}
              selectedIcao={selectedStation?.icao ?? null}
              onSelectStation={setSelectedStation}
            />
          </MapContainer>

          <div className="wx-legend" aria-label="Jelmagyarázat">
            {(Object.keys(CATEGORY_META) as FlightCategory[]).map(
              (category) => (
                <span key={category}>
                  <i className={CATEGORY_META[category].className} />
                  {CATEGORY_META[category].label}
                </span>
              ),
            )}
          </div>

          {error ? (
            <div className="wx-map-error" role="status">
              {error}
            </div>
          ) : null}
        </div>

        <WeatherDetailPanel
          station={selectedStation}
          timeMode={timeMode}
          onClose={() => setSelectedStation(null)}
        />
      </div>
    </div>
  );
}

function FitSearch({
  stations,
  query,
}: {
  stations: WeatherStation[];
  query: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (!query.trim() || !stations.length) return;
    const first = stations[0]!;
    map.flyTo([first.lat, first.lon], Math.max(map.getZoom(), 9), {
      duration: 0.5,
    });
  }, [map, query, stations]);
  return null;
}

function InvalidateOnLayout({ selectedIcao }: { selectedIcao: string | null }) {
  const map = useMap();
  useEffect(() => {
    const first = window.setTimeout(() => map.invalidateSize(), 80);
    const second = window.setTimeout(() => map.invalidateSize(), 280);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [map, selectedIcao]);
  return null;
}
