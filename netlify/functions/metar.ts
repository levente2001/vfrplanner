/**
 * Put this file at app/api/metar/route.ts in a Next.js App Router project.
 * It uses only the standard Request/Response + fetch APIs, so the core logic
 * can also be adapted easily to other serverless/edge runtimes.
 */

const AWC_METAR_URL = "https://aviationweather.gov/api/data/metar";
const STATION_COORDS_URL =
  "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/airport-coords.json";
const USER_AGENT = "WeatherPanel/1.0 aviation-weather-client";

type AwcMetar = {
  icaoId?: string;
  obsTime?: number | string;
  reportTime?: string;
  rawOb?: string;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
};

type Point = { lat: number; lon: number };
type StationCoords = Record<string, [number, number]>;

let stationCoordsPromise: Promise<StationCoords> | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, s-maxage=60, stale-while-revalidate=120" : "no-store",
    },
  });
}

function toFinite(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceNm(a: Point, b: Point) {
  const earthRadiusNm = 3440.065;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function observationEpoch(item: AwcMetar) {
  const numeric = Number(item.obsTime);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  if (typeof item.reportTime === "string") {
    const ms = Date.parse(item.reportTime);
    if (Number.isFinite(ms)) return ms / 1000;
  }
  return 0;
}

function latestObservation(items: AwcMetar[]) {
  return [...items]
    .filter((item) => item.rawOb && item.icaoId)
    .sort((a, b) => observationEpoch(b) - observationEpoch(a))[0] ?? null;
}

async function fetchAwcMetars(ids: string[]) {
  const cleanIds = [...new Set(ids.map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (!cleanIds.length) return [] as AwcMetar[];

  const url = new URL(AWC_METAR_URL);
  url.searchParams.set("ids", cleanIds.join(","));
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (response.status === 204) return [] as AwcMetar[];
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Aviation Weather Center HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const data = (await response.json()) as unknown;
  return Array.isArray(data) ? (data as AwcMetar[]) : [];
}

async function fetchStationCoords() {
  if (!stationCoordsPromise) {
    stationCoordsPromise = fetch(STATION_COORDS_URL, {
      headers: { Accept: "application/json" },
      cache: "force-cache",
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Station coordinate HTTP ${response.status}`);
      return (await response.json()) as StationCoords;
    });
  }
  return stationCoordsPromise;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export default async function handler(request: Request) {
  try {
    const url = new URL(request.url);
    const icao = (url.searchParams.get("icao") ?? "").trim().toUpperCase();

    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      return json({ error: "A valid 4-character ICAO code is required." }, 400);
    }

    const lat = toFinite(url.searchParams.get("lat"));
    const lon = toFinite(url.searchParams.get("lon"));
    const airportPosition = lat !== null && lon !== null ? { lat, lon } : null;

    // Preferred path: ask the official AWC API for the selected airport itself.
    const direct = latestObservation(await fetchAwcMetars([icao]));
    if (direct) {
      return json({
        source: "NOAA/NWS Aviation Weather Center",
        station: direct.icaoId ?? icao,
        distanceNm: 0,
        observation: direct,
      });
    }

    if (!airportPosition) {
      return json(
        { error: `No current METAR is available for ${icao}, and airport coordinates were not supplied for a nearest-station search.` },
        404,
      );
    }

    // No local METAR: use airport coordinates only to rank nearby station IDs.
    // The actual weather values still come exclusively from AviationWeather.gov.
    const stationCoords = await fetchStationCoords();
    const nearbyStations = Object.entries(stationCoords)
      .filter(([id, coords]) => /^[A-Z0-9]{4}$/.test(id) && Array.isArray(coords) && coords.length >= 2)
      .map(([id, coords]) => ({
        id,
        point: { lat: Number(coords[0]), lon: Number(coords[1]) },
      }))
      .filter(({ point }) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
      .map((station) => ({
        ...station,
        distance: distanceNm(airportPosition, station.point),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 100);

    // AWC accepts comma-separated ICAO IDs. Query nearby candidates in small
    // batches; the first batch that returns data necessarily contains the
    // nearest currently-reporting station among the ranked candidates.
    for (const batch of chunk(nearbyStations, 25)) {
      const data = await fetchAwcMetars(batch.map((station) => station.id));
      if (!data.length) continue;

      const distances = new Map(batch.map((station) => [station.id, station.distance]));
      const candidates = data
        .filter((item) => item.rawOb && item.icaoId)
        .map((item) => {
          const stationId = item.icaoId!.toUpperCase();
          let distance = distances.get(stationId) ?? Number.POSITIVE_INFINITY;
          if (typeof item.lat === "number" && typeof item.lon === "number") {
            distance = distanceNm(airportPosition, { lat: item.lat, lon: item.lon });
          }
          return { item, distance };
        })
        .sort((a, b) => a.distance - b.distance || observationEpoch(b.item) - observationEpoch(a.item));

      const nearest = candidates[0];
      if (nearest) {
        return json({
          source: "NOAA/NWS Aviation Weather Center",
          station: nearest.item.icaoId,
          distanceNm: nearest.distance,
          observation: nearest.item,
        });
      }
    }

    return json({ error: `No current METAR reporting station was found near ${icao}.` }, 404);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unable to load Aviation Weather Center METAR data." },
      502,
    );
  }
}
