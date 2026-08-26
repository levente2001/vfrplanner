import {
  ageMinutes,
  calculateFlightCategory,
  determineCeilingFt,
  isStale,
  parseVisibilitySm,
} from "../category";
import type {
  TafSegment,
  WeatherCloud,
  WeatherStation,
  WeatherWind,
} from "../types";

type AwcCloud = { cover?: unknown; base?: unknown; type?: unknown };
type AwcMetar = Record<string, unknown> & {
  icaoId?: unknown;
  rawOb?: unknown;
  reportTime?: unknown;
  obsTime?: unknown;
  metarType?: unknown;
  name?: unknown;
  lat?: unknown;
  lon?: unknown;
  temp?: unknown;
  dewp?: unknown;
  wdir?: unknown;
  wspd?: unknown;
  wgst?: unknown;
  visib?: unknown;
  altim?: unknown;
  wxString?: unknown;
  clouds?: unknown;
};
type AwcTaf = {
  icaoId?: unknown;
  rawTAF?: unknown;
  issueTime?: unknown;
  validTimeFrom?: unknown;
  validTimeTo?: unknown;
  fcsts?: unknown;
};
type AwcForecast = {
  timeFrom?: unknown;
  timeTo?: unknown;
  timeBec?: unknown;
  fcstChange?: unknown;
  probability?: unknown;
  wdir?: unknown;
  wspd?: unknown;
  wgst?: unknown;
  visib?: unknown;
  wxString?: unknown;
  clouds?: unknown;
};

const HUNGARY_BBOX = { south: 45.7, north: 48.7, west: 16, east: 23 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function epochToIso(value: unknown) {
  const number = asNumber(value);
  return number == null ? null : new Date(number * 1000).toISOString();
}

function parseWind(wdir: unknown, wspd: unknown, wgst: unknown): WeatherWind {
  return {
    direction: wdir === "VRB" ? "VRB" : asNumber(wdir),
    speedKt: asNumber(wspd),
    gustKt: asNumber(wgst),
  };
}

function parseClouds(value: unknown): WeatherCloud[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((cloud: AwcCloud) => ({
    cover: asString(cloud.cover) ?? "UNK",
    baseFt: asNumber(cloud.base),
    type: asString(cloud.type),
  }));
}

function tafType(
  change: string | null,
  probability: number | null,
): TafSegment["type"] {
  if (probability === 30) return "PROB30";
  if (probability === 40) return "PROB40";
  if (change === "BECMG") return "BECMG";
  if (change === "TEMPO") return "TEMPO";
  if (change === "FM") return "FM";
  if (!change) return "BASE";
  return "OTHER";
}

function parseTafSegments(taf: AwcTaf | undefined): TafSegment[] {
  const forecasts = Array.isArray(taf?.fcsts) ? taf.fcsts.filter(isRecord) : [];
  return forecasts.map((forecast: AwcForecast, index) => {
    const probability = asNumber(forecast.probability);
    const change = asString(forecast.fcstChange);
    const visibilitySm = parseVisibilitySm(forecast.visib);
    return {
      id: `${asString(taf?.icaoId) ?? "TAF"}-${index}`,
      type: tafType(change, probability),
      probability,
      from: epochToIso(forecast.timeFrom),
      to: epochToIso(forecast.timeTo),
      becomingAt: epochToIso(forecast.timeBec),
      wind: parseWind(forecast.wdir, forecast.wspd, forecast.wgst),
      visibilitySm,
      visibilityText: visibilitySm == null ? "n/a" : `${visibilitySm} SM`,
      weather: asString(forecast.wxString),
      clouds: parseClouds(forecast.clouds),
    };
  });
}

export function adaptAviationWeather(
  metars: unknown,
  tafs: unknown,
  staleAfterMinutes = 90,
  now = Date.now(),
) {
  const tafByIcao = new Map<string, AwcTaf>();
  if (Array.isArray(tafs)) {
    for (const taf of tafs.filter(isRecord) as AwcTaf[]) {
      const icao = asString(taf.icaoId);
      if (icao) tafByIcao.set(icao, taf);
    }
  }

  if (!Array.isArray(metars)) return [];
  return (metars.filter(isRecord) as AwcMetar[])
    .filter((metar) => {
      const lat = asNumber(metar.lat);
      const lon = asNumber(metar.lon);
      const icao = asString(metar.icaoId);
      return (
        !!icao &&
        icao.startsWith("LH") &&
        lat != null &&
        lon != null &&
        lat >= HUNGARY_BBOX.south &&
        lat <= HUNGARY_BBOX.north &&
        lon >= HUNGARY_BBOX.west &&
        lon <= HUNGARY_BBOX.east
      );
    })
    .map((metar) => {
      const icao = asString(metar.icaoId)!;
      const clouds = parseClouds(metar.clouds);
      const observedAt =
        asString(metar.reportTime) ?? epochToIso(metar.obsTime);
      const stale = isStale(observedAt, staleAfterMinutes, now);
      const ceilingFt = determineCeilingFt(clouds);
      const visibilitySm = metar.rawOb?.toString().includes("CAVOK")
        ? 6
        : parseVisibilitySm(metar.visib);
      const taf = tafByIcao.get(icao);
      const category = calculateFlightCategory({
        ceilingFt,
        visibilitySm,
        stale,
      });
      return {
        icao,
        name: asString(metar.name) ?? icao,
        lat: asNumber(metar.lat)!,
        lon: asNumber(metar.lon)!,
        hasMetar: true,
        provider: "aviationweather",
        reportType: asString(metar.metarType) === "SPECI" ? "SPECI" : "METAR",
        rawMetar: asString(metar.rawOb),
        rawTaf: asString(taf?.rawTAF),
        observedAt,
        issuedAt: asString(taf?.issueTime),
        ageMinutes: ageMinutes(observedAt, now),
        stale,
        category,
        ceilingFt,
        visibilitySm,
        visibilityText:
          visibilitySm == null
            ? "n/a"
            : metar.visib === "6+"
              ? "6+ SM"
              : `${visibilitySm} SM`,
        wind: parseWind(metar.wdir, metar.wspd, metar.wgst),
        temperatureC: asNumber(metar.temp),
        dewpointC: asNumber(metar.dewp),
        qnhHpa: asNumber(metar.altim),
        clouds,
        weather: asString(metar.wxString),
        tafSegments: parseTafSegments(taf),
      } satisfies WeatherStation;
    });
}
