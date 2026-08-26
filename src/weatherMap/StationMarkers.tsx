import { divIcon } from "leaflet";
import { Fragment, useMemo, useState } from "react";
import { Marker, Tooltip, useMapEvents } from "react-leaflet";
import type { Airport } from "@/lib/vfr/nav";
import type { WeatherStation } from "@/lib/weather/types";
import { CATEGORY_META, formatCeiling, formatTime, formatWind } from "./format";

export function StationMarkers({
  stations,
  airports,
  showAirports,
  timeMode,
  selectedIcao,
  onSelectStation,
}: {
  stations: WeatherStation[];
  airports: Airport[];
  showAirports: boolean;
  timeMode: "utc" | "local";
  selectedIcao: string | null;
  onSelectStation: (station: WeatherStation) => void;
}) {
  const [zoom, setZoom] = useState(7);
  const useClusters = zoom <= 7;
  const metarIds = new Set(stations.map((station) => station.icao));
  const groupedStations = useMemo(() => {
    const groups = new Map<string, WeatherStation[]>();
    for (const station of stations) {
      const key = `${Math.round(station.lat * 2) / 2}:${Math.round(station.lon * 2) / 2}`;
      groups.set(key, [...(groups.get(key) ?? []), station]);
    }
    return [...groups.values()];
  }, [stations]);

  useMapEvents({
    zoomend(event) {
      setZoom(event.target.getZoom());
    },
  });

  return (
    <>
      {groupedStations.map((group) => {
        if (useClusters && group.length > 1) {
          return (
            <ClusterMarker
              key={group.map((station) => station.icao).join("-")}
              stations={group}
            />
          );
        }
        return group.map((station) => (
          <StationMarker
            key={station.icao}
            station={station}
            timeMode={timeMode}
            selected={selectedIcao === station.icao}
            onSelectStation={onSelectStation}
          />
        ));
      })}
      {showAirports &&
        airports
          .filter(
            (airport) =>
              airport.icao.startsWith("LH") && !metarIds.has(airport.icao),
          )
          .map((airport) => (
            <Marker
              key={airport.icao}
              position={[airport.lat, airport.lon]}
              icon={divIcon({
                className: "wx-airport-shell",
                html: `<div class="wx-airport-dot"><span>${airport.icao}</span></div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
            >
              <Tooltip direction="top">
                {airport.icao} · {airport.name} · nincs aktuális METAR
              </Tooltip>
            </Marker>
          ))}
    </>
  );
}

function StationMarker({
  station,
  timeMode,
  selected,
  onSelectStation,
}: {
  station: WeatherStation;
  timeMode: "utc" | "local";
  selected: boolean;
  onSelectStation: (station: WeatherStation) => void;
}) {
  const meta = CATEGORY_META[station.category];
  const rotation =
    station.wind.direction === "VRB" || station.wind.direction == null
      ? 0
      : station.wind.direction + 180;
  const icon = divIcon({
    className: "wx-marker-shell",
    html: `<div class="wx-marker ${meta.className} ${selected ? "is-selected" : ""}" aria-label="${station.icao} ${station.category}"><span>${station.icao}</span><b>${station.category}</b><i style="transform: rotate(${rotation}deg)"></i></div>`,
    iconSize: [38, 32],
    iconAnchor: [19, 16],
  });

  return (
    <Marker
      position={[station.lat, station.lon]}
      icon={icon}
      eventHandlers={{ click: () => onSelectStation(station) }}
    >
      <Tooltip direction="top" offset={[0, -14]} opacity={0.98}>
        <div className="wx-tooltip">
          <strong>
            {station.icao} · {station.name}
          </strong>
          <span>
            {station.category}
            {station.stale ? " · elavult" : ""} · {formatWind(station.wind)}
          </span>
          <span>
            {station.visibilityText} · {formatCeiling(station.ceilingFt)} ·{" "}
            {formatTime(station.observedAt, timeMode)}
          </span>
        </div>
      </Tooltip>
    </Marker>
  );
}

function ClusterMarker({ stations }: { stations: WeatherStation[] }) {
  const position = [
    stations.reduce((sum, station) => sum + station.lat, 0) / stations.length,
    stations.reduce((sum, station) => sum + station.lon, 0) / stations.length,
  ] as [number, number];
  const priority = ["LIFR", "IFR", "MVFR", "UNKNOWN", "VFR"] as const;
  const category =
    priority.find((item) =>
      stations.some((station) => station.category === item),
    ) ?? "UNKNOWN";
  const meta = CATEGORY_META[category];
  const icon = divIcon({
    className: "wx-marker-shell",
    html: `<div class="wx-cluster-marker ${meta.className}"><span>${stations.length}</span><b>${category}</b></div>`,
    iconSize: [42, 34],
    iconAnchor: [21, 17],
  });

  return (
    <Marker position={position} icon={icon}>
      <Tooltip direction="top" offset={[0, -14]} opacity={0.98}>
        <div className="wx-tooltip">
          {stations.map((station) => (
            <Fragment key={station.icao}>
              <strong>{station.icao}</strong>
              <span>
                {station.category} · {formatWind(station.wind)}
              </span>
            </Fragment>
          ))}
        </div>
      </Tooltip>
    </Marker>
  );
}
