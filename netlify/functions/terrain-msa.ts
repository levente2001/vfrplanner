import { requestFromEvent, responseToEvent } from "./_request";

type Point = { lat: number; lon: number };
type RequestBody = { waypoints?: Point[]; corridorNm?: number };

const FT_PER_M = 3.280839895;
const EARTH_RADIUS_NM = 3440.065;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "private, max-age=3600" : "no-store",
    },
  });
}

function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Point;
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

function distanceNm(a: Point, b: Point) {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interpolate(a: Point, b: Point, t: number): Point {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

function offsetNm(point: Point, bearingDeg: number, nm: number): Point {
  const angular = nm / EARTH_RADIUS_NM;
  const bearing = bearingDeg * Math.PI / 180;
  const lat1 = point.lat * Math.PI / 180;
  const lon1 = point.lon * Math.PI / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

function bearing(a: Point, b: Point) {
  const toRad = (d: number) => d * Math.PI / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function samplesForLeg(a: Point, b: Point, corridorNm: number) {
  const length = distanceNm(a, b);
  const steps = Math.max(1, Math.ceil(length / 2));
  const course = bearing(a, b);
  const offsets = [-corridorNm, -corridorNm / 2, 0, corridorNm / 2, corridorNm];
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const center = interpolate(a, b, i / steps);
    for (const lateral of offsets) {
      points.push(lateral === 0 ? center : offsetNm(center, course + 90, lateral));
    }
  }
  return points;
}

async function elevations(points: Point[]) {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  const base = key
    ? "https://customer-api.open-meteo.com/v1/elevation"
    : "https://api.open-meteo.com/v1/elevation";
  const values: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = new URL(base);
    url.searchParams.set("latitude", chunk.map((p) => p.lat.toFixed(6)).join(","));
    url.searchParams.set("longitude", chunk.map((p) => p.lon.toFixed(6)).join(","));
    if (key) url.searchParams.set("apikey", key);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "vfrplanner/0.1 production" },
    });
    if (!response.ok) throw new Error(`Elevation API HTTP ${response.status}`);
    const data = await response.json() as { elevation?: number[] };
    if (!Array.isArray(data.elevation) || data.elevation.length !== chunk.length) {
      throw new Error("Elevation API returned incomplete data.");
    }
    values.push(...data.elevation);
  }
  return values;
}

export default async function handle(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json() as RequestBody;
    const waypoints = Array.isArray(body.waypoints) ? body.waypoints.filter(validPoint) : [];
    if (waypoints.length < 2 || waypoints.length > 15) {
      return json({ error: "Provide between 2 and 15 valid waypoints." }, 400);
    }
    const corridorNm = Number.isFinite(body.corridorNm)
      ? Math.min(10, Math.max(1, Number(body.corridorNm)))
      : 5;
    const legs = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const points = samplesForLeg(waypoints[i]!, waypoints[i + 1]!, corridorNm);
      const heights = await elevations(points);
      const finiteHeights = heights.filter(Number.isFinite);
      if (!finiteHeights.length) throw new Error("No terrain elevations were returned.");
      const maxTerrainM = Math.max(...finiteHeights);
      const maxTerrainFt = maxTerrainM * FT_PER_M;
      const msaFt = Math.ceil((maxTerrainFt + 1000) / 100) * 100;
      legs.push({ legIndex: i, maxTerrainFt: Math.round(maxTerrainFt), msaFt, samples: points.length });
    }
    return json({
      source: "Open-Meteo Elevation API / Copernicus DEM GLO-90",
      corridorNm,
      method: "Sampled terrain plus 1000 ft, rounded up to 100 ft",
      legs,
      warning: "Terrain-only planning aid. Obstacles and official published minima are not included.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Terrain MSA request failed." }, 502);
  }
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(await handle(requestFromEvent(event, "/api/terrain-msa")));
}
