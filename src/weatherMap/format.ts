import type {
  FlightCategory,
  TafSegment,
  WeatherCloud,
  WeatherStation,
  WeatherWind,
} from "@/lib/weather/types";

export const CATEGORY_META: Record<
  FlightCategory,
  { label: string; color: string; className: string }
> = {
  VFR: { label: "VFR", color: "#22c55e", className: "wx-cat-vfr" },
  MVFR: { label: "MVFR", color: "#3b82f6", className: "wx-cat-mvfr" },
  IFR: { label: "IFR", color: "#ef4444", className: "wx-cat-ifr" },
  LIFR: { label: "LIFR", color: "#a855f7", className: "wx-cat-lifr" },
  UNKNOWN: { label: "UNK", color: "#6b7280", className: "wx-cat-unknown" },
};

export function formatUtc(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatHungaryTime(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: string | null, mode: "utc" | "local") {
  return mode === "utc"
    ? `${formatUtc(value)} UTC`
    : `${formatHungaryTime(value)} HU`;
}

export function formatWind(wind: WeatherWind) {
  const dir =
    wind.direction === "VRB"
      ? "VRB"
      : wind.direction == null
        ? "n/a"
        : `${Math.round(wind.direction)}°`;
  const speed = wind.speedKt == null ? "n/a" : `${Math.round(wind.speedKt)} kt`;
  const gust = wind.gustKt == null ? "" : ` G${Math.round(wind.gustKt)}`;
  return `${dir} ${speed}${gust}`;
}

export function formatCeiling(value: number | null) {
  return value == null ? "No ceiling" : `${value} ft`;
}

export function formatClouds(clouds: WeatherCloud[]) {
  if (!clouds.length) return "No reported cloud layers";
  return clouds
    .map((cloud) =>
      `${cloud.cover}${cloud.type ? ` ${cloud.type}` : ""} ${cloud.baseFt ?? ""}`.trim(),
    )
    .join(", ");
}

export function stationSearchText(station: WeatherStation) {
  return `${station.icao} ${station.name}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function tafSegmentClass(segment: TafSegment) {
  if (segment.type === "TEMPO")
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  if (segment.type === "PROB30" || segment.type === "PROB40")
    return "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200";
  if (segment.type === "BECMG")
    return "border-sky-400/40 bg-sky-400/10 text-sky-200";
  if (segment.type === "FM")
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  return "border-slate-400/25 bg-slate-400/10 text-slate-100";
}
