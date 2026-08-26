import {
  ageMinutes,
  calculateFlightCategory,
  determineCeilingFt,
  isStale,
} from "../category";
import type {
  TafSegment,
  WeatherCloud,
  WeatherStation,
  WeatherWind,
} from "../types";

type CheckWxEnvelope = { data?: unknown[] };
type CheckWxBundle = {
  icao: string;
  metar: CheckWxEnvelope;
  taf: CheckWxEnvelope;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNumber(record: Record<string, unknown>, key: string) {
  return asNumber(record[key]);
}

function parseWind(value: unknown): WeatherWind {
  if (!isRecord(value)) return { direction: null, speedKt: null, gustKt: null };
  const speed = isRecord(value.speed) ? getNumber(value.speed, "kts") : null;
  const gust = isRecord(value.gust) ? getNumber(value.gust, "kts") : null;
  return {
    direction: value.direction === "VRB" ? "VRB" : asNumber(value.degrees),
    speedKt: speed,
    gustKt: gust,
  };
}

function parseClouds(value: unknown): WeatherCloud[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((cloud) => {
    const type = isRecord(cloud.type) ? asString(cloud.type.code) : null;
    return {
      cover: asString(cloud.code) ?? "UNK",
      baseFt: asNumber(cloud.feet),
      type,
    };
  });
}

function parseVisibility(value: unknown) {
  if (!isRecord(value)) return { visibilitySm: null, visibilityText: "n/a" };
  const miles = asNumber(value.miles);
  return {
    visibilitySm: miles,
    visibilityText:
      asString(value.text) ?? (miles == null ? "n/a" : `${miles} SM`),
  };
}

function parseTafSegments(taf: Record<string, unknown> | null): TafSegment[] {
  const forecasts = Array.isArray(taf?.forecast)
    ? taf.forecast.filter(isRecord)
    : [];
  return forecasts.map((forecast, index) => {
    const change = isRecord(forecast.change) ? forecast.change : {};
    const period = isRecord(change.period) ? change.period : {};
    const probability = asNumber(change.probability);
    const code = asString(change.code) ?? asString(change.indicator);
    const visibility = parseVisibility(forecast.visibility);
    return {
      id: `${asString(taf?.icao) ?? "TAF"}-${index}`,
      type:
        probability === 30
          ? "PROB30"
          : probability === 40
            ? "PROB40"
            : code === "TEMPO" || code === "BECMG" || code === "FM"
              ? code
              : code === "INITIAL"
                ? "BASE"
                : "OTHER",
      probability,
      from: asString(period.from) ?? null,
      to: asString(period.to) ?? null,
      wind: parseWind(forecast.wind),
      visibilitySm: visibility.visibilitySm,
      visibilityText: visibility.visibilityText,
      weather: Array.isArray(forecast.conditions)
        ? forecast.conditions
            .filter(isRecord)
            .map((item) => asString(item.text) ?? asString(item.code))
            .filter(Boolean)
            .join(", ")
        : null,
      clouds: parseClouds(forecast.clouds),
      raw: asString(forecast.section) ?? undefined,
    };
  });
}

export function adaptCheckWx(
  items: unknown[],
  staleAfterMinutes = 90,
): WeatherStation[] {
  return items.filter(isRecord).flatMap((item) => {
    const bundle = item as Partial<CheckWxBundle>;
    if (!bundle.icao || !bundle.metar || !bundle.taf) return [];
    const metar = bundle.metar.data?.find(isRecord) ?? null;
    if (!metar) return [];
    const taf = bundle.taf.data?.find(isRecord) ?? null;
    const station = isRecord(metar.station) ? metar.station : {};
    const geometry = isRecord(station.geometry) ? station.geometry : {};
    const coordinates = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];
    const lon = asNumber(coordinates[0]);
    const lat = asNumber(coordinates[1]);
    if (lat == null || lon == null || !bundle.icao.startsWith("LH")) return [];

    const clouds = parseClouds(metar.clouds);
    const ceilingFt = determineCeilingFt(clouds);
    const visibility = parseVisibility(metar.visibility);
    const observedAt = asString(metar.observed);
    const stale = isStale(observedAt, staleAfterMinutes);

    return [
      {
        icao: bundle.icao,
        name: asString(station.name) ?? bundle.icao,
        lat,
        lon,
        hasMetar: true,
        provider: "checkwx",
        reportType: "METAR",
        rawMetar: asString(metar.raw_text),
        rawTaf: asString(taf?.raw_text),
        observedAt,
        issuedAt: asString(taf?.issued),
        ageMinutes: ageMinutes(observedAt),
        stale,
        category: calculateFlightCategory({
          ceilingFt,
          visibilitySm: visibility.visibilitySm,
          stale,
        }),
        ceilingFt,
        visibilitySm: visibility.visibilitySm,
        visibilityText: visibility.visibilityText,
        wind: parseWind(metar.wind),
        temperatureC: isRecord(metar.temperature)
          ? getNumber(metar.temperature, "celsius")
          : null,
        dewpointC: isRecord(metar.dewpoint)
          ? getNumber(metar.dewpoint, "celsius")
          : null,
        qnhHpa: isRecord(metar.pressure)
          ? getNumber(metar.pressure, "mb")
          : null,
        clouds,
        weather: Array.isArray(metar.conditions)
          ? metar.conditions
              .filter(isRecord)
              .map((item) => asString(item.text) ?? asString(item.code))
              .filter(Boolean)
              .join(", ")
          : null,
        tafSegments: parseTafSegments(taf),
      },
    ];
  });
}
