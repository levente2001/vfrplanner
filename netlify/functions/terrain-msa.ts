import { inflateSync } from "node:zlib";
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

type DecodedPng = {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
};

const TERRAIN_ZOOM = 10;
const terrainTileCache = new Map<string, Promise<DecodedPng>>();

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(bytes: Uint8Array): DecodedPng {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) throw new Error("Terrain tile is not a valid PNG.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Uint8Array[] = [];

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error("Terrain PNG is truncated.");

    if (type === "IHDR") {
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      bitDepth = bytes[start + 8]!;
      colorType = bytes[start + 9]!;
      interlace = bytes[start + 12]!;
    } else if (type === "IDAT") {
      idat.push(bytes.slice(start, end));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }

  if (!width || !height || bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error("Unsupported terrain PNG format.");
  }

  const channels = colorType === 6 ? 4 : 3;
  const compressedLength = idat.reduce((sum, part) => sum + part.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let cursor = 0;
  for (const part of idat) {
    compressed.set(part, cursor);
    cursor += part.length;
  }

  const raw = new Uint8Array(inflateSync(compressed));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let rawOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++]!;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const source = raw[rawOffset++]!;
      const left = x >= channels ? pixels[rowStart + x - channels]! : 0;
      const up = y > 0 ? pixels[rowStart - stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[rowStart - stride + x - channels]! : 0;
      let value = source;
      if (filter === 1) value = (source + left) & 0xff;
      else if (filter === 2) value = (source + up) & 0xff;
      else if (filter === 3) value = (source + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) value = (source + paethPredictor(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);
      pixels[rowStart + x] = value;
    }
  }

  return { width, height, channels, pixels };
}

function tileCoordinate(point: Point, zoom = TERRAIN_ZOOM) {
  const n = 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const x = ((point.lon + 180) / 360) * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  return {
    tileX: Math.floor(x),
    tileY: Math.floor(y),
    pixelX: Math.min(255, Math.max(0, Math.floor((x - Math.floor(x)) * 256))),
    pixelY: Math.min(255, Math.max(0, Math.floor((y - Math.floor(y)) * 256))),
  };
}

async function terrainTile(tileX: number, tileY: number, zoom = TERRAIN_ZOOM) {
  const key = `${zoom}/${tileX}/${tileY}`;
  let pending = terrainTileCache.get(key);
  if (!pending) {
    pending = (async () => {
      const url = `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${zoom}/${tileX}/${tileY}.png`;
      const response = await fetch(url, {
        headers: { Accept: "image/png", "User-Agent": "vfrplanner/0.1 production" },
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
      return decodePng(new Uint8Array(await response.arrayBuffer()));
    })();
    terrainTileCache.set(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    terrainTileCache.delete(key);
    throw error;
  }
}

async function elevationsFromTerrainTiles(points: Point[]) {
  const grouped = new Map<string, Array<{ index: number; pixelX: number; pixelY: number; tileX: number; tileY: number }>>();
  points.forEach((point, index) => {
    const t = tileCoordinate(point);
    const key = `${t.tileX}/${t.tileY}`;
    const list = grouped.get(key) ?? [];
    list.push({ index, ...t });
    grouped.set(key, list);
  });

  const values = new Array<number>(points.length);
  await Promise.all(
    [...grouped.values()].map(async (samples) => {
      const first = samples[0]!;
      const tile = await terrainTile(first.tileX, first.tileY);
      for (const sample of samples) {
        const offset = (sample.pixelY * tile.width + sample.pixelX) * tile.channels;
        const r = tile.pixels[offset]!;
        const g = tile.pixels[offset + 1]!;
        const b = tile.pixels[offset + 2]!;
        const elevationM = r * 256 + g + b / 256 - 32768;
        values[sample.index] = elevationM;
      }
    }),
  );
  return values;
}

async function elevationsFromOpenMeteo(points: Point[], key: string) {
  const values: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = new URL("https://customer-api.open-meteo.com/v1/elevation");
    url.searchParams.set("latitude", chunk.map((p) => p.lat.toFixed(6)).join(","));
    url.searchParams.set("longitude", chunk.map((p) => p.lon.toFixed(6)).join(","));
    url.searchParams.set("apikey", key);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "vfrplanner/0.1 production" },
      cache: "no-store",
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

async function elevations(points: Point[]) {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  if (key) {
    try {
      return {
        values: await elevationsFromOpenMeteo(points, key),
        source: "Open-Meteo customer Elevation API / Copernicus DEM GLO-90",
      };
    } catch (error) {
      console.warn("Open-Meteo elevation failed; falling back to AWS Terrain Tiles.", error);
    }
  }

  return {
    values: await elevationsFromTerrainTiles(points),
    source: "AWS Open Data Terrain Tiles / Mapzen Terrarium DEM",
  };
}

export default async function handle(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json() as RequestBody;
    const waypoints = Array.isArray(body.waypoints) ? body.waypoints.filter(validPoint) : [];
    if (waypoints.length < 2 || waypoints.length > 19) {
      return json({ error: "Provide between 2 and 19 valid waypoints." }, 400);
    }
    const corridorNm = Number.isFinite(body.corridorNm)
      ? Math.min(10, Math.max(1, Number(body.corridorNm)))
      : 5;
    const legs = [];
    let elevationSource = "";
    for (let i = 0; i < waypoints.length - 1; i++) {
      const points = samplesForLeg(waypoints[i]!, waypoints[i + 1]!, corridorNm);
      const elevationResult = await elevations(points);
      elevationSource = elevationResult.source;
      const finiteHeights = elevationResult.values.filter(Number.isFinite);
      if (!finiteHeights.length) throw new Error("No terrain elevations were returned.");
      const maxTerrainM = Math.max(...finiteHeights);
      const maxTerrainFt = maxTerrainM * FT_PER_M;
      const msaFt = Math.ceil((maxTerrainFt + 1000) / 100) * 100;
      legs.push({ legIndex: i, maxTerrainFt: Math.round(maxTerrainFt), msaFt, samples: points.length });
    }
    return json({
      source: elevationSource || "AWS Open Data Terrain Tiles / Mapzen Terrarium DEM",
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
