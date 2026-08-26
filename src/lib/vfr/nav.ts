export type LatLng = { lat: number; lng: number };

export type Airport = {
  icao: string;
  name: string;
  lat: number;
  lon: number;
};

export type WaypointMeta = {
  label: string;
  name?: string;
  lat: number;
  lon: number;
  source?: "input" | "map";
  inputIndex?: number;
  replacedInputIndex?: number;
};

type NumericPlan = {
  tas: number;
  fuelFlow: number;
  windDir: number;
  windSpeed: number;
  variationValue: number;
  variationDirection: "E" | "W";
};

export type Leg = {
  from: string;
  to: string;
  trueCourse: number;
  variation: number;
  variationDirection: "E" | "W";
  magneticCourse: number;
  magneticHeading: number;
  trueHeading: number;
  wca: number;
  distance: number;
  ete: number | null;
  groundSpeed: number | null;
  fuel: number | null;
  tas: number;
  error?: string;
};

const AIRPORTS: Airport[] = buildAirportList([
  ["LHBC", "Békéscsaba", "464059N", "0210954E"],
  ["LHBP", "Budapest/Liszt Ferenc Intl", "472622N", "0191543E"],
  ["LHDC", "Debrecen Intl", "472929N", "0213655E"],
  ["LHPR", "Győr/Pér", "473729N", "0174844E"],
  ["LHNY", "Nyíregyháza", "475903N", "0214129E"],
  ["LHPP", "Pécs/Pogány", "455927N", "0181427E"],
  ["LHSM", "Hévíz-Balaton", "464111N", "0170933E"],
  ["LHUD", "Szeged", "461502N", "0200527E"],
  ["LHBD", "Börgönd/Alba Airport", "470725N", "0182955E"],
  ["LHAK", "Atkár-Gyöngyöshalász", "474317N", "0195413E"],
  ["LHBO", "Bácsbokod", "460904N", "0190859E"],
  ["LHBK", "Balatonkeresztúr", "464144N", "0172340E"],
  ["LHBL", "Ballószög", "465149N", "0193332E"],
  ["LHBT", "Bátonyterenye", "480126N", "0194833E"],
  ["LHFC", "Bodmér-Felcsút", "472647N", "0183322E"],
  ["LHBY", "Bőny", "474008N", "0174705E"],
  ["LHFH", "Budakeszi/Farkashegy", "472922.32N", "0185435.53E"],
  ["LHBS", "Budaörs", "472657N", "0185909E"],
  ["LHBF", "Bükfürdő", "472328N", "0164812E"],
  ["LHCL", "Cegléd", "470939N", "0195243E"],
  ["LHDA", "Dáka", "471630N", "0172433E"],
  ["LHDK", "Dunakeszi", "473704N", "0190836E"],
  ["LHDV", "Dunaújváros", "465342N", "0185437E"],
  ["LHER", "Eger", "475427N", "0202415E"],
  ["LHEM", "Esztergom", "474542N", "0184401E"],
  ["LHFP", "Fertőrákos/Piusz-Puszta", "474440N", "0163651E"],
  ["LHFM", "Fertőszentmiklós", "473501N", "0165042E"],
  ["LHGD", "Gödöllő", "473425N", "0191957E"],
  ["LHGY", "Gyöngyös/Pipishegy", "474846N", "0195837E"],
  ["LHGR", "Gyúró", "472340N", "0184518E"],
  ["LHHO", "Hajdúszoboszló", "472721N", "0212327E"],
  ["LHHK", "Hajmáskér", "470842N", "0175946E"],
  ["LHHM", "Hódmezővásárhely", "462304N", "0201830E"],
  ["LHJK", "Jakabszállás", "464451.41N", "0193618.46E"],
  ["LHKT", "Kadarkút", "461508N", "0173625E"],
  ["LHKA", "Kalocsa", "463252N", "0185634E"],
  ["LHKV", "Kaposvár/Kaposújlak", "462321N", "0174357E"],
  ["LHKE", "Kecskemét", "465502.94N", "0194457.33E"],
  ["LHKD", "Kecskéd", "473053N", "0181936E"],
  ["LHKI", "Kiskőrös/Akasztó", "463925N", "0191433E"],
  ["LHKH", "Kiskunfélegyháza", "464406N", "0195305E"],
  ["LHKF", "Kiskunhalas/Füzespuszta", "462206N", "0192844E"],
  ["LHKK", "Kiskunlacháza", "471042N", "0190407E"],
  ["LHKM", "Kunmadaras", "472309N", "0204626E"],
  ["LHKU", "Kutas/Hertelendy", "462222N", "0172542E"],
  ["LHLI", "Lipót/Szigetköz", "475126.60N", "0172654.17E"],
  ["LHMR", "Maklár", "474854.9N", "0202517.4E"],
  ["LHMP", "Matkópuszta", "464758N", "0194102E"],
  ["LHMC", "Miskolc", "480754N", "0204730E"],
  ["LHNK", "Nagykanizsa", "462600.4N", "0165731.7E"],
  ["LHNS", "Nagyszénás", "464153N", "0204007E"],
  ["LHOY", "Őcsény", "461843.08N", "0184549.8E"],
  ["LHPA", "Pápa", "472150.35N", "0173002.05E"],
  ["LHPK", "Papkutapuszta", "465241N", "0180218.14E"],
  ["LHPC", "Pusztacsalád", "472947N", "0165352E"],
  ["LHPS", "Pusztaszer", "463436N", "0195924E"],
  ["LHPW", "Pusztaszer West", "463248N", "0195736E"],
  ["LHUH", "Sárszentmihály/Úrhida", "470735N", "0181842E"],
  ["LHSK", "Siófok/Kiliti", "465137N", "0180537E"],
  ["LHSI", "Sitke", "471406N", "0170135E"],
  ["LHSU", "Surjány", "471204N", "0202848E"],
  ["LHSB", "Szabadszállás/Balázspuszta", "465401N", "0192159E"],
  ["LHSV", "Szarvas/Kákahalom", "464814N", "0203140E"],
  ["LHST", "Szatymaz", "461933N", "0200306E"],
  ["LHSZ", "Szentes", "463642N", "0201659E"],
  ["LHSA", "Szentkirályszabadja", "470452N", "0175759E"],
  ["LHSN", "Szolnok", "470722.16N", "0201408.13E"],
  ["LHSS", "Szolnok/Szandaszőlős", "470835N", "0201146E"],
  ["LHSY", "Szombathely", "471657N", "0163735E"],
  ["LHTM", "Tápiószentmárton", "471849N", "0194626E"],
  ["LHTL", "Tököl", "472044N", "0185851E"],
  ["LHVE", "Veresegyház", "473817.613N", "0191523E"],
  ["LHZA", "Zalaegerszeg/Andráshida", "465307N", "0164719E"],
  ["LHZK", "Zalakaros", "463313N", "0170904E"],
  ["LHGU", "Győrújbarát", "473619N", "0173936E"],
  ["LHKC", "Kecel", "463210N", "0191430E"],
  ["LOWS", "Salzburg", "474736N", "0130015E"],
  ["LOWW", "Vienna Intl", "480637N", "0163412E"],
  ["LZIB", "Bratislava", "481012N", "0171246E"],
  ["LDZA", "Zagreb", "454434N", "0160408E"],
  ["LROP", "Bucharest Otopeni", "443416N", "0260506E"],
]);

const PLACES = buildPlaceIndex([
  { label: "Budapest", lat: 47.4979, lon: 19.0402, aliases: ["bp", "liszt ferenc"] },
  { label: "Békéscsaba", lat: 46.6736, lon: 21.0877, aliases: ["bekescsaba"] },
  { label: "Debrecen", lat: 47.5316, lon: 21.6273 },
  { label: "Győr", lat: 47.6875, lon: 17.6504, aliases: ["gyor", "per", "pér"] },
  { label: "Hévíz", lat: 46.7903, lon: 17.1841, aliases: ["heviz", "sarmellek", "sármellék", "balaton"] },
  { label: "Nyíregyháza", lat: 47.9554, lon: 21.7167, aliases: ["nyiregyhaza"] },
  { label: "Pécs", lat: 46.0727, lon: 18.2323, aliases: ["pecs", "pogany", "pogány"] },
  { label: "Szeged", lat: 46.253, lon: 20.1414 },
  { label: "Kecskemét", lat: 46.9062, lon: 19.6897, aliases: ["kecskemet"] },
  { label: "Miskolc", lat: 48.1035, lon: 20.7784 },
  { label: "Szolnok", lat: 47.1621, lon: 20.1825 },
  { label: "Siófok", lat: 46.9091, lon: 18.0746, aliases: ["siofok"] },
  { label: "Pápa", lat: 47.3301, lon: 17.4674, aliases: ["papa"] },
  { label: "Fertőszentmiklós", lat: 47.5899, lon: 16.8752, aliases: ["fertoszentmiklos"] },
  { label: "Tököl", lat: 47.3218, lon: 18.9622, aliases: ["tokol"] },
  { label: "Jakabszállás", lat: 46.7617, lon: 19.6049, aliases: ["jakabszallas"] },
  { label: "Székesfehérvár", lat: 47.186, lon: 18.4221, aliases: ["szekesfehervar"] },
  { label: "Tatabánya", lat: 47.5692, lon: 18.4048, aliases: ["tatabanya"] },
  { label: "Veszprém", lat: 47.1028, lon: 17.9093, aliases: ["veszprem"] },
  { label: "Zalaegerszeg", lat: 46.8417, lon: 16.8416 },
  { label: "Kaposvár", lat: 46.3594, lon: 17.7968, aliases: ["kaposvar"] },
  { label: "Szekszárd", lat: 46.3474, lon: 18.7062, aliases: ["szekszard"] },
  { label: "Salgótarján", lat: 48.1038, lon: 19.803, aliases: ["salgotarjan"] },
  { label: "Eger", lat: 47.9025, lon: 20.3772 },
  { label: "Szombathely", lat: 47.2307, lon: 16.6218 },
  { label: "Sopron", lat: 47.6817, lon: 16.5845 },
  { label: "Nagykanizsa", lat: 46.459, lon: 16.9897 },
  { label: "Dunaújváros", lat: 46.9619, lon: 18.9355, aliases: ["dunaujvaros"] },
  { label: "Hódmezővásárhely", lat: 46.4181, lon: 20.3301, aliases: ["hodmezovasarhely"] },
  { label: "Szarvas", lat: 46.8667, lon: 20.55 },
  { label: "Orosháza", lat: 46.567, lon: 20.666, aliases: ["oroshaza"] },
  { label: "Kiskunfélegyháza", lat: 46.7121, lon: 19.8446, aliases: ["kiskunfelegyhaza"] },
  { label: "Kiskunhalas", lat: 46.4319, lon: 19.4875 },
  { label: "Cegléd", lat: 47.1727, lon: 19.7995, aliases: ["cegled"] },
  { label: "Vác", lat: 47.7759, lon: 19.1361, aliases: ["vac"] },
  { label: "Esztergom", lat: 47.7856, lon: 18.7403 },
  { label: "Mosonmagyaróvár", lat: 47.8679, lon: 17.2699, aliases: ["mosonmagyarovar"] },
  { label: "Alcsútdoboz", lat: 47.4251, lon: 18.6022, aliases: ["alcsutdoboz"] },
]);

export async function loadAirports() {
  return AIRPORTS;
}

function buildAirportList(rows: Array<[string, string, string, string]>): Airport[] {
  return rows.map(([icao, name, lat, lon]) => ({
    icao,
    name,
    lat: parseDmsCoordinate(lat),
    lon: parseDmsCoordinate(lon),
  }));
}

function parseDmsCoordinate(value: string) {
  const match = value.match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/);
  if (!match) throw new Error(`Invalid DMS coordinate: ${value}`);
  const deg = Number(match[1]);
  const min = Number(match[2]);
  const sec = Number(match[3]);
  const sign = match[4] === "S" || match[4] === "W" ? -1 : 1;
  return sign * (deg + min / 60 + sec / 3600);
}

export async function resolveWaypoints(input: string, airports: Airport[]) {
  const tokens = tokenizeWaypoints(input, airports);

  const result: WaypointMeta[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const coord = parseCoordPair(token, tokens[i + 1]);
    if (coord) {
      result.push({
        label: `WP${result.length + 1}`,
        lat: coord.lat,
        lon: coord.lon,
      });
      if (coord.usedNext) i++;
      continue;
    }

    const airport = airports.find((ap) => ap.icao === token.toUpperCase());
    if (airport) {
      result.push({
        label: airport.icao,
        name: airport.name,
        lat: airport.lat,
        lon: airport.lon,
      });
      continue;
    }

    const place = PLACES[normalizeLookupKey(token)];
    if (place) {
      result.push({ ...place });
      continue;
    }

    const geocoded = await geocodeHungarianSettlement(token);
    if (geocoded) {
      result.push(geocoded);
      continue;
    }

    throw new Error(`Unknown waypoint: ${token}`);
  }
  return result;
}

function tokenizeWaypoints(input: string, airports: Airport[]) {
  return input
    .split(/\n|;/)
    .flatMap((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return [];
      if (parseCoordPair(trimmed)) return [trimmed];
      if (airports.some((ap) => ap.icao === trimmed.toUpperCase())) return [trimmed];
      if (PLACES[normalizeLookupKey(trimmed)]) return [trimmed];
      return trimmed.split(/\s+/);
    })
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildPlaceIndex(
  places: Array<WaypointMeta & { aliases?: string[] }>,
): Record<string, WaypointMeta> {
  const index: Record<string, WaypointMeta> = {};
  for (const { aliases = [], ...place } of places) {
    for (const key of [place.label, ...aliases]) {
      index[normalizeLookupKey(key)] = place;
    }
  }
  return index;
}

function normalizeLookupKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("hu-HU")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

async function geocodeHungarianSettlement(query: string): Promise<WaypointMeta | null> {
  if (typeof fetch !== "function") return null;
  const key = normalizeLookupKey(query);
  const cached = readGeocodeCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: "jsonv2",
    q: `${query}, Hungary`,
    countrycodes: "hu",
    limit: "1",
    addressdetails: "1",
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
      addresstype?: string;
      type?: string;
      address?: Record<string, string>;
    }>;
    const first = data[0];
    if (!first?.lat || !first.lon) return null;
    const label =
      first.address?.city ||
      first.address?.town ||
      first.address?.village ||
      first.address?.municipality ||
      first.name ||
      query;
    const waypoint = {
      label,
      name: first.display_name,
      lat: Number(first.lat),
      lon: Number(first.lon),
    };
    if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) return null;
    writeGeocodeCache(key, waypoint);
    return waypoint;
  } catch {
    return null;
  }
}

export async function reverseGeocodeWaypoint(pos: LatLng): Promise<WaypointMeta | null> {
  if (typeof fetch !== "function") return null;
  const key = `reverse.${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`;
  const cached = readGeocodeCache(key);
  if (cached) return { ...cached, lat: pos.lat, lon: pos.lng };

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(pos.lat),
    lon: String(pos.lng),
    zoom: "10",
    addressdetails: "1",
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    };
    const label =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.municipality ||
      data.address?.county ||
      data.name;
    if (!label) return null;
    const waypoint = {
      label,
      name: data.display_name,
      lat: pos.lat,
      lon: pos.lng,
    };
    writeGeocodeCache(key, waypoint);
    return waypoint;
  } catch {
    return null;
  }
}

function readGeocodeCache(key: string): WaypointMeta | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(`vfrplanner.geocode.${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WaypointMeta;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeGeocodeCache(key: string, waypoint: WaypointMeta) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`vfrplanner.geocode.${key}`, JSON.stringify(waypoint));
  } catch {
    /* cache is optional */
  }
}

function parseCoordPair(a: string, b?: string) {
  const combined = a.includes(",") ? a : b ? `${a},${b}` : "";
  const match = combined.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, usedNext: !a.includes(",") };
}

export function computeLegs(points: LatLng[], meta: WaypointMeta[], n: NumericPlan) {
  const legs: Leg[] = [];
  const variation = Math.abs(n.variationValue);
  const signedVariation = signedMagneticVariation(variation, n.variationDirection);
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const trueCourse = bearing(from, to);
    const distance = haversineNm(from, to);
    const magneticCourse = applyMagneticVariation(trueCourse, variation, n.variationDirection);

    // Aviation wind direction is a FROM bearing. WCA is positive when the pilot must steer right.
    const relativeWindAngle = degToRad(n.windDir - trueCourse);
    const asinArg = clamp((n.windSpeed / n.tas) * Math.sin(relativeWindAngle), -1, 1);
    const wca = radToDeg(Math.asin(asinArg));
    const trueHeading = normalizeHeading(trueCourse + wca);
    const magneticHeading = normalizeHeading(trueHeading - signedVariation);
    const groundSpeed =
      n.tas * Math.cos(degToRad(wca)) - n.windSpeed * Math.cos(relativeWindAngle);
    const validGs = Number.isFinite(groundSpeed) && groundSpeed > 0;
    const ete = validGs ? distance / groundSpeed : null;
    legs.push({
      from: meta[i]?.label ?? `WP${i + 1}`,
      to: meta[i + 1]?.label ?? `WP${i + 2}`,
      trueCourse,
      variation,
      variationDirection: n.variationDirection,
      magneticCourse,
      magneticHeading,
      trueHeading,
      wca,
      distance,
      ete,
      groundSpeed: validGs ? groundSpeed : null,
      fuel: ete === null ? null : ete * n.fuelFlow,
      tas: n.tas,
      error: validGs ? undefined : "The selected TAS is insufficient for the entered wind conditions.",
    });
  }

  const validLegs = legs.filter((leg) => !leg.error);
  return {
    legs,
    totalDistance: legs.reduce((sum, leg) => sum + leg.distance, 0),
    totalTime: validLegs.reduce((sum, leg) => sum + (leg.ete ?? 0), 0),
    totalFuel: validLegs.reduce((sum, leg) => sum + (leg.fuel ?? 0), 0),
    hasInvalidLeg: validLegs.length !== legs.length,
  };
}

export function formatHM(hours: number) {
  const min = Math.round(hours * 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function signed(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function signedMagneticVariation(value: number, direction: "E" | "W") {
  const magnitude = Math.abs(value);
  return direction === "E" ? magnitude : -magnitude;
}

export function applyMagneticVariation(trueDirection: number, value: number, direction: "E" | "W") {
  return normalizeHeading(trueDirection - signedMagneticVariation(value, direction));
}

function haversineNm(a: LatLng, b: LatLng) {
  const rNm = 3440.065;
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lng - a.lng);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * rNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a: LatLng, b: LatLng) {
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const dLon = degToRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalize360(radToDeg(Math.atan2(y, x)));
}

export function normalizeHeading(deg: number) {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

const normalize360 = normalizeHeading;

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
