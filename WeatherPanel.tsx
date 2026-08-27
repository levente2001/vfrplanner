import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FileText,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/ui/card";
import { PdfChartViewer } from "@/weather/PdfChartViewer";

const DEFAULT_ICAO = "LHDC";
const DEFAULT_AIRPORT_NAME = "Debrecen International Airport";
const REFRESH_MS = 5 * 60 * 1000;
// Browser requests go to our same-origin proxy. The proxy fetches the official
// NOAA/NWS Aviation Weather Center METAR API server-side.
const METAR_API_URL = "/api/metar";
const LLSIGWX_PDF_PROXY_URL = "/api/weather/llsigwx.pdf";

const QUICK_ICAOS: { code: string; label: string }[] = [
  { code: "LHDC", label: "Debrecen" },
  { code: "LHBP", label: "Budapest" },
  { code: "LHSN", label: "Szolnok" },
  { code: "LHNY", label: "Nyíregyháza" },
];

type RunwayOption = {
  id: string;
  reciprocal: string;
  heading: number;
};

const DEFAULT_RUNWAYS: RunwayOption[] = [
  { id: "04R", reciprocal: "22L", heading: 42 },
  { id: "22L", reciprocal: "04R", heading: 222 },
];

type AirportDbRunway = {
  closed?: string;
  le_ident?: string;
  le_heading_degT?: string;
  he_ident?: string;
  he_heading_degT?: string;
};

type AirportDbRecord = {
  name?: string;
  municipality?: string;
  latitude_deg?: string | number;
  longitude_deg?: string | number;
  runways?: AirportDbRunway[];
};

type AirportPosition = {
  lat: number;
  lon: number;
};

type AwcCloud = {
  cover?: string;
  base?: number | null;
};

type AwcMetar = {
  icaoId?: string;
  obsTime?: number | string;
  reportTime?: string;
  temp?: number | null;
  dewp?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  altim?: number | null;
  rawOb?: string;
  fltCat?: string;
  cover?: string;
  clouds?: AwcCloud[];
  lat?: number;
  lon?: number;
};

type MetarProxyResponse = {
  station: string;
  distanceNm: number | null;
  observation: AwcMetar;
  source: "NOAA/NWS Aviation Weather Center";
};

type ParsedMetar = {
  raw: string;
  observed: string | null;
  windDirection: number | null;
  windVariable: boolean;
  windSpeed: number | null;
  windGust: number | null;
  variableFrom: number | null;
  variableTo: number | null;
  visibilityKm: number | null;
  cavok: boolean;
  ceilingFt: number | null;
  cloudLabel: string;
  temperatureC: number | null;
  dewPointC: number | null;
  qnhHpa: number | null;
  category: "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKNOWN";
};

function headingFromRunwayIdent(ident: string | undefined) {
  const match = ident?.match(/^(\d{2})/);
  if (!match) return null;
  const heading = Number(match[1]) * 10;
  return heading === 360 ? 0 : heading;
}

function parseHeading(value: string | undefined, ident: string | undefined) {
  const numeric =
    value === undefined || value === "" ? Number.NaN : Number(value);
  if (Number.isFinite(numeric)) return ((numeric % 360) + 360) % 360;
  return headingFromRunwayIdent(ident);
}

function parseAirportRunways(data: AirportDbRecord): RunwayOption[] {
  const options: RunwayOption[] = [];

  for (const runway of data.runways ?? []) {
    if (runway.closed === "1") continue;

    const lowId = runway.le_ident?.trim();
    const highId = runway.he_ident?.trim();
    const lowHeading = parseHeading(runway.le_heading_degT, lowId);
    const highHeading = parseHeading(runway.he_heading_degT, highId);

    if (lowId && highId && lowHeading !== null) {
      options.push({ id: lowId, reciprocal: highId, heading: lowHeading });
    }
    if (lowId && highId && highHeading !== null) {
      options.push({ id: highId, reciprocal: lowId, heading: highHeading });
    }
  }

  return options.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

function signedAngleDifference(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

function toFiniteNumber(value: string | number | undefined) {
  if (value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchAirportRecord(targetIcao: string) {
  const urls = [
    `https://raw.githubusercontent.com/ZeroxyDev/runways-db/main/icao/${targetIcao}.json`,
    `https://raw.githubusercontent.com/epranka/airports-db/master/icao/${targetIcao}.json`,
  ];

  let lastStatus: number | null = null;
  for (const url of urls) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "force-cache",
    });
    lastStatus = response.status;
    if (response.ok) return (await response.json()) as AirportDbRecord;
  }

  throw new Error(`Airport data HTTP ${lastStatus ?? "unknown"}`);
}

function parseSignedTemperature(value: string) {
  return value.startsWith("M") ? -Number(value.slice(1)) : Number(value);
}

function parseVisibilityKm(tokens: string[], raw: string) {
  if (raw.includes(" CAVOK ") || raw.endsWith(" CAVOK")) return 10;

  const smIndex = tokens.findIndex((token) => /SM$/.test(token));
  if (smIndex >= 0) {
    const token = tokens[smIndex];
    const clean = token.replace("SM", "").replace(/^P/, "");
    let miles = 0;

    if (clean.includes("/")) {
      const [numerator, denominator] = clean.split("/").map(Number);
      miles = denominator ? numerator / denominator : 0;
      const previous = tokens[smIndex - 1];
      if (previous && /^\d+$/.test(previous)) miles += Number(previous);
    } else {
      miles = Number(clean);
    }

    return Number.isFinite(miles) ? miles * 1.609344 : null;
  }

  const metersToken = tokens.find((token) => /^\d{4}$/.test(token));
  if (metersToken) {
    const meters = Number(metersToken);
    return meters === 9999 ? 10 : meters / 1000;
  }

  return null;
}

function parseMetar(rawInput: string): ParsedMetar {
  const raw = rawInput.trim().replace(/\s+/g, " ");
  const tokens = raw.split(" ");

  const observedMatch = raw.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  const observed = observedMatch
    ? `${observedMatch[1]} ${observedMatch[2]}:${observedMatch[3]}Z`
    : null;

  const windMatch = raw.match(/\b(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  const windVariable = windMatch?.[1] === "VRB";
  const windDirection =
    windMatch && !windVariable ? Number(windMatch[1]) : null;
  const windSpeed = windMatch ? Number(windMatch[2]) : null;
  const windGust = windMatch?.[3] ? Number(windMatch[3]) : null;

  const variableMatch = raw.match(/\b(\d{3})V(\d{3})\b/);
  const variableFrom = variableMatch ? Number(variableMatch[1]) : null;
  const variableTo = variableMatch ? Number(variableMatch[2]) : null;

  const cavok = /\bCAVOK\b/.test(raw);
  const visibilityKm = parseVisibilityKm(tokens, raw);

  const cloudGroups = [
    ...raw.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3}|\/{3})\b/g),
  ].map((match) => ({
    amount: match[1],
    height: match[2] === "///" ? null : Number(match[2]) * 100,
  }));

  const ceilingGroups = cloudGroups.filter(
    (group) =>
      ["BKN", "OVC", "VV"].includes(group.amount) && group.height !== null,
  );
  const ceilingFt = ceilingGroups.length
    ? Math.min(...ceilingGroups.map((group) => group.height as number))
    : null;

  let cloudLabel = "No ceiling reported";
  if (cavok) cloudLabel = "CAVOK";
  else if (/\b(NCD|NSC|SKC|CLR)\b/.test(raw))
    cloudLabel = "No significant cloud";
  else if (ceilingFt !== null)
    cloudLabel = `Ceiling ${ceilingFt.toLocaleString()} ft`;
  else if (cloudGroups.length) {
    cloudLabel = cloudGroups
      .map((group) =>
        group.height === null
          ? group.amount
          : `${group.amount} ${(group.height / 100).toString().padStart(3, "0")}`,
      )
      .join(" · ");
  }

  const tempMatch = raw.match(/\b(M?\d{2})\/(M?\d{2})\b/);
  const temperatureC = tempMatch ? parseSignedTemperature(tempMatch[1]) : null;
  const dewPointC = tempMatch ? parseSignedTemperature(tempMatch[2]) : null;

  const qnhMatch = raw.match(/\bQ(\d{4})\b/);
  const qnhHpa = qnhMatch ? Number(qnhMatch[1]) : null;

  let category: ParsedMetar["category"] = "UNKNOWN";
  const effectiveCeiling = cavok
    ? Number.POSITIVE_INFINITY
    : (ceilingFt ?? Number.POSITIVE_INFINITY);
  const effectiveVisibility = visibilityKm ?? Number.POSITIVE_INFINITY;

  if (visibilityKm !== null || ceilingFt !== null || cavok) {
    if (effectiveCeiling < 500 || effectiveVisibility < 1.6) category = "LIFR";
    else if (effectiveCeiling < 1000 || effectiveVisibility < 5)
      category = "IFR";
    else if (effectiveCeiling <= 3000 || effectiveVisibility <= 8)
      category = "MVFR";
    else category = "VFR";
  }

  return {
    raw,
    observed,
    windDirection,
    windVariable,
    windSpeed,
    windGust,
    variableFrom,
    variableTo,
    visibilityKm,
    cavok,
    ceilingFt,
    cloudLabel,
    temperatureC,
    dewPointC,
    qnhHpa,
    category,
  };
}

function parseAwcVisibilityKm(value: AwcMetar["visib"], raw: string) {
  if (/\bCAVOK\b/.test(raw)) return 10;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value * 1.609344;
  }

  if (typeof value === "string") {
    const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(numeric)) return numeric * 1.609344;
  }

  return null;
}

function parseAwcMetar(observation: AwcMetar): ParsedMetar {
  const raw = observation.rawOb?.trim().replace(/\s+/g, " ") ?? "";
  const rawParsed = parseMetar(raw);

  const windVariable =
    rawParsed.windVariable ||
    /\bVRB\d{2,3}(?:G\d{2,3})?(?:KT|MPS)\b/.test(raw) ||
    String(observation.wdir ?? "").toUpperCase() === "VRB";
  const numericWindDirection = Number(observation.wdir);
  const windDirection =
    !windVariable && Number.isFinite(numericWindDirection)
      ? ((numericWindDirection % 360) + 360) % 360
      : rawParsed.windDirection;

  const windSpeed =
    typeof observation.wspd === "number" && Number.isFinite(observation.wspd)
      ? observation.wspd
      : rawParsed.windSpeed;
  const windGust =
    typeof observation.wgst === "number" && Number.isFinite(observation.wgst)
      ? observation.wgst
      : rawParsed.windGust;

  const cavok = rawParsed.cavok;
  const visibilityKm =
    parseAwcVisibilityKm(observation.visib, raw) ?? rawParsed.visibilityKm;

  const ceilingLayers = (observation.clouds ?? []).filter(
    (layer) =>
      ["BKN", "OVC", "VV"].includes((layer.cover ?? "").toUpperCase()) &&
      typeof layer.base === "number" &&
      Number.isFinite(layer.base),
  );
  const ceilingFt = ceilingLayers.length
    ? Math.min(...ceilingLayers.map((layer) => layer.base as number))
    : rawParsed.ceilingFt;

  let cloudLabel = rawParsed.cloudLabel;
  if (cavok) {
    cloudLabel = "CAVOK";
  } else if (ceilingFt !== null) {
    cloudLabel = `Ceiling ${Math.round(ceilingFt).toLocaleString()} ft`;
  } else if ((observation.clouds ?? []).length) {
    cloudLabel = (observation.clouds ?? [])
      .map((layer) =>
        typeof layer.base === "number"
          ? `${layer.cover ?? ""} ${Math.round(layer.base / 100)
              .toString()
              .padStart(3, "0")}`.trim()
          : (layer.cover ?? ""),
      )
      .filter(Boolean)
      .join(" · ");
  }

  const temperatureC =
    typeof observation.temp === "number" && Number.isFinite(observation.temp)
      ? observation.temp
      : rawParsed.temperatureC;
  const dewPointC =
    typeof observation.dewp === "number" && Number.isFinite(observation.dewp)
      ? observation.dewp
      : rawParsed.dewPointC;

  const altimeter = observation.altim;
  const qnhHpa =
    typeof altimeter === "number" && Number.isFinite(altimeter)
      ? altimeter > 800
        ? altimeter
        : altimeter >= 20 && altimeter <= 40
          ? altimeter * 33.8638866667
          : rawParsed.qnhHpa
      : rawParsed.qnhHpa;

  const allowedCategories: ParsedMetar["category"][] = [
    "VFR",
    "MVFR",
    "IFR",
    "LIFR",
  ];
  const sourceCategory = observation.fltCat?.toUpperCase() as
    ParsedMetar["category"] | undefined;
  const category =
    sourceCategory && allowedCategories.includes(sourceCategory)
      ? sourceCategory
      : rawParsed.category;

  let observed = rawParsed.observed;
  const obsTime = Number(observation.obsTime);
  if (Number.isFinite(obsTime) && obsTime > 0) {
    const date = new Date(obsTime * 1000);
    if (!Number.isNaN(date.getTime())) {
      observed = `${date.getUTCDate().toString().padStart(2, "0")} ${date
        .getUTCHours()
        .toString()
        .padStart(
          2,
          "0",
        )}:${date.getUTCMinutes().toString().padStart(2, "0")}Z`;
    }
  }

  return {
    raw,
    observed,
    windDirection,
    windVariable,
    windSpeed,
    windGust,
    variableFrom: rawParsed.variableFrom,
    variableTo: rawParsed.variableTo,
    visibilityKm,
    cavok,
    ceilingFt,
    cloudLabel,
    temperatureC,
    dewPointC,
    qnhHpa,
    category,
  };
}

function formatValue(value: number | null, unit = "") {
  return value === null ? "—" : `${Math.round(value)}${unit}`;
}

function categoryClasses(category: ParsedMetar["category"]) {
  switch (category) {
    case "VFR":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "MVFR":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "IFR":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "LIFR":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-3 transition-colors duration-300 hover:border-sky-500/40">
      <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </dt>
      {loading ? (
        <dd className="wp-shimmer mt-1.5 h-5 w-14 rounded bg-slate-200" />
      ) : (
        <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
          {value}
        </dd>
      )}
    </div>
  );
}

export function WeatherPanel() {
  const [icao, setIcao] = useState(DEFAULT_ICAO);
  const [icaoInput, setIcaoInput] = useState(DEFAULT_ICAO);
  const [airportName, setAirportName] = useState(DEFAULT_AIRPORT_NAME);
  const [airportPosition, setAirportPosition] =
    useState<AirportPosition | null>(null);
  const [runways, setRunways] = useState<RunwayOption[]>(DEFAULT_RUNWAYS);
  const [metar, setMetar] = useState<ParsedMetar | null>(null);
  const [metarStation, setMetarStation] = useState<string>(DEFAULT_ICAO);
  const [metarDistanceNm, setMetarDistanceNm] = useState<number | null>(0);
  const [selectedRunway, setSelectedRunway] = useState<string>(
    DEFAULT_RUNWAYS[0].id,
  );
  const [loading, setLoading] = useState(true);
  const [airportLoading, setAirportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadMetar = useCallback(
    async (targetIcao: string, position: AirportPosition | null) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ icao: targetIcao });
        if (position) {
          params.set("lat", String(position.lat));
          params.set("lon", String(position.lon));
        }

        const response = await fetch(`${METAR_API_URL}?${params.toString()}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as
          MetarProxyResponse | { error?: string } | null;

        if (!response.ok) {
          const message =
            payload && "error" in payload ? payload.error : undefined;
          throw new Error(message || `METAR HTTP ${response.status}`);
        }

        if (
          !payload ||
          !("observation" in payload) ||
          !payload.observation?.rawOb
        ) {
          throw new Error(`No current METAR returned for ${targetIcao}`);
        }

        setMetar(parseAwcMetar(payload.observation));
        setMetarStation(
          payload.station || payload.observation.icaoId || targetIcao,
        );
        setMetarDistanceNm(payload.distanceNm);
        setUpdatedAt(new Date());
      } catch (err) {
        setMetar(null);
        setMetarStation("");
        setMetarDistanceNm(null);
        setError(
          err instanceof Error ? err.message : "Unable to load live METAR",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadAirportData = useCallback(async (targetIcao: string) => {
    setAirportLoading(true);

    try {
      const data = await fetchAirportRecord(targetIcao);
      const nextRunways = parseAirportRunways(data);
      const lat = toFiniteNumber(data.latitude_deg);
      const lon = toFiniteNumber(data.longitude_deg);
      const position = lat !== null && lon !== null ? { lat, lon } : null;

      setAirportName(
        data.name?.trim() || data.municipality?.trim() || targetIcao,
      );
      setAirportPosition(position);
      setRunways(nextRunways);
      setSelectedRunway(nextRunways[0]?.id ?? "");
      return position;
    } catch {
      setAirportPosition(null);
      if (targetIcao === DEFAULT_ICAO) {
        setAirportName(DEFAULT_AIRPORT_NAME);
        setRunways(DEFAULT_RUNWAYS);
        setSelectedRunway(DEFAULT_RUNWAYS[0].id);
      } else {
        setAirportName(targetIcao);
        setRunways([]);
        setSelectedRunway("");
      }
      return null;
    } finally {
      setAirportLoading(false);
    }
  }, []);

  const loadAirportAndWeather = useCallback(
    async (targetIcao: string) => {
      const position = await loadAirportData(targetIcao);
      await loadMetar(targetIcao, position);
    },
    [loadAirportData, loadMetar],
  );

  useEffect(() => {
    // The async loader synchronizes the selected ICAO with airport and METAR data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAirportAndWeather(icao);
  }, [icao, loadAirportAndWeather]);

  useEffect(() => {
    const timer = window.setInterval(
      () => void loadMetar(icao, airportPosition),
      REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [airportPosition, icao, loadMetar]);

  const applyIcao = useCallback(
    (rawValue: string) => {
      const nextIcao = rawValue.trim().toUpperCase();

      if (!/^[A-Z0-9]{4}$/.test(nextIcao)) {
        setSearchError("Enter a valid 4-character ICAO code, e.g. LHBP.");
        return;
      }

      setSearchError(null);
      setIcaoInput(nextIcao);

      if (nextIcao === icao) {
        void loadAirportAndWeather(nextIcao);
        return;
      }

      setMetar(null);
      setMetarStation("");
      setMetarDistanceNm(null);
      setUpdatedAt(null);
      setIcao(nextIcao);
    },
    [icao, loadAirportAndWeather],
  );

  const submitIcao = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyIcao(icaoInput);
  };

  const runway =
    runways.find((item) => item.id === selectedRunway) ?? runways[0] ?? null;

  const wind = useMemo(() => {
    if (
      metar?.windDirection === null ||
      metar?.windSpeed === null ||
      !metar ||
      !runway
    ) {
      return { head: null, tail: null, cross: null, side: "", delta: null };
    }

    const delta = signedAngleDifference(metar.windDirection, runway.heading);
    const radians = (delta * Math.PI) / 180;
    const along = metar.windSpeed * Math.cos(radians);
    const crossSigned = metar.windSpeed * Math.sin(radians);

    return {
      head: along > 0 ? Math.round(along) : 0,
      tail: along < 0 ? Math.round(Math.abs(along)) : 0,
      cross: Math.round(Math.abs(crossSigned)),
      side: crossSigned < 0 ? "L" : crossSigned > 0 ? "R" : "",
      delta,
    };
  }, [metar, runway]);

  const risk = useMemo(() => {
    if (wind.cross === null) return "—";
    if (wind.cross <= 10) return "LOW";
    if (wind.cross <= 15) return "MODERATE";
    return "HIGH";
  }, [wind.cross]);

  const riskClasses =
    risk === "HIGH"
      ? "text-rose-700"
      : risk === "MODERATE"
        ? "text-amber-700"
        : risk === "LOW"
          ? "text-emerald-700"
          : "text-slate-600";

  const gaugeSpeed = metar?.windGust ?? metar?.windSpeed ?? 0;
  const gaugeRotation = -120 + (Math.min(gaugeSpeed, 45) / 45) * 240;
  const ceilingPercent = metar?.cavok
    ? 100
    : metar?.ceilingFt === null || metar?.ceilingFt === undefined
      ? 0
      : Math.min(100, (metar.ceilingFt / 5000) * 100);

  const hasWindDirection =
    metar?.windDirection !== null && metar?.windDirection !== undefined;

  return (
    <section id="weather" className="min-w-0 scroll-mt-24">
      <style>{`
        @keyframes wp-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wp-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes wp-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.8); } }
        @keyframes wp-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .wp-fade-in { animation: wp-fade-in .55s cubic-bezier(.16,1,.3,1) both; }
        .wp-shimmer { background-image: linear-gradient(90deg, rgba(148,163,184,0.12) 0%, rgba(148,163,184,0.30) 50%, rgba(148,163,184,0.12) 100%); background-size: 800px 100%; animation: wp-shimmer 1.5s linear infinite; }
        .wp-pulse-dot { animation: wp-pulse 1.8s ease-in-out infinite; }
        .wp-sweep { animation: wp-sweep 8s linear infinite; transform-origin: 50% 50%; }
        .wp-needle { transition: transform .7s cubic-bezier(.22,1,.36,1); transform-origin: 50% 50%; }
        @media (prefers-reduced-motion: reduce) {
          .wp-fade-in, .wp-shimmer, .wp-pulse-dot, .wp-sweep, .wp-needle { animation: none !important; transition: none !important; }
        }
      `}</style>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-2xl shadow-slate-200/80">
        <CardContent className="p-0">
          <article className="overflow-hidden bg-white text-slate-900">
            {/* Search bar */}
            <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-4 sm:px-5">
              <form
                onSubmit={submitIcao}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <label
                  htmlFor="weather-icao-search"
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600"
                >
                  Airport ICAO
                </label>
                <div className="flex min-w-0 flex-1 gap-2">
                  <div className="relative min-w-0 flex-1">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="weather-icao-search"
                      value={icaoInput}
                      onChange={(event) => {
                        setIcaoInput(
                          event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 4),
                        );
                        if (searchError) setSearchError(null);
                      }}
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={4}
                      placeholder="LHBP"
                      aria-describedby={
                        searchError ? "weather-icao-error" : undefined
                      }
                      className="h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white pl-9 pr-3 font-mono text-base font-semibold uppercase tracking-[0.2em] text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-600 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || airportLoading}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-600 bg-sky-600 px-4 text-sm font-semibold text-white transition-all duration-200 hover:bg-sky-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading || airportLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    <span className="hidden sm:inline">Search</span>
                  </button>
                </div>
              </form>

              {searchError && (
                <p
                  id="weather-icao-error"
                  className="wp-fade-in mt-2 text-xs text-amber-400"
                >
                  {searchError}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {QUICK_ICAOS.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => applyIcao(item.code)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide transition-all duration-200 ${
                      icao === item.code
                        ? "border-sky-500/60 bg-sky-500/15 text-sky-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                  >
                    {item.code}{" "}
                    <span className="text-slate-600">· {item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Header */}
            <header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                  <span className="relative flex size-1.5">
                    <span className="wp-pulse-dot absolute inline-flex size-full rounded-full bg-sky-400" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-sky-400" />
                  </span>
                  Weather
                </p>
                <h2
                  key={icao}
                  className="wp-fade-in mt-1 truncate font-mono text-xl font-bold tracking-tight sm:text-2xl"
                >
                  {icao}{" "}
                  <span className="font-sans font-normal text-slate-600">
                    · {airportName}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {metarStation
                    ? `METAR: ${metarStation}${metarDistanceNm !== null && metarDistanceNm > 0.05 ? ` · ${metarDistanceNm.toFixed(1)} NM away` : " · local station"} · auto-refresh every 5 minutes`
                    : "Finding nearest METAR station…"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 font-mono text-xs font-bold tracking-wide transition-all duration-300 ${categoryClasses(metar?.category ?? "UNKNOWN")}`}
                >
                  {metar?.category ?? (loading ? "LOADING" : "UNKNOWN")}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                  {metar?.observed ? `${metar.observed}` : "No data"}
                </span>
                <button
                  type="button"
                  onClick={() => void loadMetar(icao, airportPosition)}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-all duration-200 hover:border-sky-500/40 hover:text-sky-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    className={`size-3.5 ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>
            </header>

            {error && (
              <div className="wp-fade-in mx-4 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 sm:mx-5">
                Live METAR could not be loaded: {error}. The panel will retry
                automatically.
              </div>
            )}

            <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.06fr_0.76fr_1.18fr]">
              {/* Runway selector + compass */}
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                      <Navigation className="size-3.5" /> Runway
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {runways.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedRunway(item.id)}
                          className={`rounded-lg border px-3 py-1.5 font-mono text-sm font-bold transition-all duration-200 active:scale-95 ${
                            selectedRunway === item.id
                              ? "border-sky-500 bg-sky-600 text-white"
                              : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800"
                          }`}
                        >
                          {item.id}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 truncate font-mono text-lg font-semibold text-slate-900">
                      {runway
                        ? `${runway.id}/${runway.reciprocal}`
                        : airportLoading
                          ? "Loading runways…"
                          : "No runway data"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      Crosswind risk
                    </div>
                    <div className={`mt-1 text-sm font-bold ${riskClasses}`}>
                      {risk}
                    </div>
                  </div>
                </div>

                <div className="relative mx-auto aspect-square w-full max-w-[320px]">
                  <svg
                    viewBox="0 0 320 320"
                    role="img"
                    aria-label="Runway and wind compass"
                    className="h-full w-full"
                  >
                    <defs>
                      <filter
                        id="dialGlow"
                        x="-50%"
                        y="-50%"
                        width="200%"
                        height="200%"
                      >
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      {/*<radialGradient id="dialSweep" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                      </radialGradient>*/}
                    </defs>

                    <circle
                      cx="160"
                      cy="160"
                      r="144"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="2"
                    />
                    <g
                      className="wp-sweep"
                      opacity={loading ? 1 : 0.5}
                      style={{ transition: "opacity .4s" }}
                    >
                      <path
                        d="M160 160 L160 20 A140 140 0 0 1 220 40 Z"
                        fill="url(#dialSweep)"
                      />
                    </g>
                    <circle
                      cx="160"
                      cy="160"
                      r="118"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="1"
                    />

                    {Array.from({ length: 36 }, (_, index) => {
                      const angle = index * 10;
                      const major = angle % 30 === 0;
                      return (
                        <line
                          key={angle}
                          x1="160"
                          y1="18"
                          x2="160"
                          y2={major ? "39" : "31"}
                          stroke={major ? "#94a3b8" : "#dbe3ee"}
                          strokeWidth={major ? 2 : 1}
                          transform={`rotate(${angle} 160 160)`}
                        />
                      );
                    })}

                    <text
                      x="160"
                      y="53"
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="16"
                      fontWeight="700"
                    >
                      N
                    </text>
                    <text
                      x="160"
                      y="281"
                      textAnchor="middle"
                      fill="#475569"
                      fontSize="14"
                      fontWeight="700"
                    >
                      S
                    </text>
                    <text
                      x="43"
                      y="166"
                      textAnchor="middle"
                      fill="#475569"
                      fontSize="14"
                      fontWeight="700"
                    >
                      W
                    </text>
                    <text
                      x="277"
                      y="166"
                      textAnchor="middle"
                      fill="#475569"
                      fontSize="14"
                      fontWeight="700"
                    >
                      E
                    </text>

                    {runway && (
                      <g
                        className="wp-needle"
                        style={{ transform: `rotate(${runway.heading}deg)` }}
                      >
                        <rect
                          x="147"
                          y="69"
                          width="26"
                          height="182"
                          rx="4"
                          fill="#e2e8f0"
                          stroke="#94a3b8"
                          strokeWidth="2"
                        />
                        <line
                          x1="160"
                          y1="92"
                          x2="160"
                          y2="230"
                          stroke="#64748b"
                          strokeWidth="2"
                          strokeDasharray="10 8"
                          opacity=".4"
                        />

                        {/* Runway designators shown on the corresponding runway ends. */}
                        <text
                          x="160"
                          y="126"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#334155"
                          fontSize="12"
                          fontWeight="800"
                          fontFamily="monospace"
                          transform="rotate(180 160 103)"
                        >
                          {runway.reciprocal}
                        </text>
                        <text
                          x="160"
                          y="241"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#334155"
                          fontSize="12"
                          fontWeight="800"
                          fontFamily="monospace"
                        >
                          {runway.id}
                        </text>
                      </g>
                    )}

                    {hasWindDirection && (
                      <g
                        className="wp-needle"
                        style={{
                          transform: `rotate(${metar!.windDirection}deg)`,
                        }}
                        filter="url(#dialGlow)"
                      >
                        <line
                          x1="160"
                          y1="62"
                          x2="160"
                          y2="139"
                          stroke="#38bdf8"
                          strokeWidth="7"
                          strokeLinecap="round"
                        />
                        <path d="M160 145 L146 120 L174 120 Z" fill="#38bdf8" />
                      </g>
                    )}

                    <circle
                      cx="160"
                      cy="160"
                      r="10"
                      fill="#ffffff"
                      stroke="#94a3b8"
                      strokeWidth="2"
                    />
                    <circle cx="160" cy="160" r="3" fill="#38bdf8" />

                    <text
                      x="160"
                      y="320"
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="10"
                      letterSpacing="1.5"
                    >
                      WIND{" "}
                      {metar?.windVariable
                        ? "VRB"
                        : hasWindDirection
                          ? `${metar!.windDirection!.toString().padStart(3, "0")}°`
                          : "—"}
                    </text>
                  </svg>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <Stat
                    label="Headwind"
                    value={wind.head === null ? "—" : `${wind.head} kt`}
                    loading={loading}
                  />
                  <Stat
                    label={`Xwind${wind.side ? ` ${wind.side}` : ""}`}
                    value={wind.cross === null ? "—" : `${wind.cross} kt`}
                    loading={loading}
                  />
                  <Stat
                    label="Tailwind"
                    value={wind.tail === null ? "—" : `${wind.tail} kt`}
                    loading={loading}
                  />
                </dl>
              </section>

              {/* Wind gauge */}
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                  Wind
                </h3>

                <div className="mx-auto mt-3 aspect-square w-full max-w-[270px]">
                  <svg
                    viewBox="0 0 260 260"
                    role="img"
                    aria-label="Wind speed gauge"
                    className="h-full w-full"
                  >
                    <path
                      d="M45 190 A105 105 0 1 1 215 190"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="16"
                      strokeLinecap="round"
                    />
                    <path
                      d="M45 190 A105 105 0 1 1 215 190"
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="4"
                      strokeLinecap="round"
                      opacity="0.6"
                    />

                    {[0, 10, 20, 30, 40].map((value) => {
                      const angle = -120 + (value / 45) * 240;
                      return (
                        <g key={value} transform={`rotate(${angle} 130 140)`}>
                          <line
                            x1="130"
                            y1="35"
                            x2="130"
                            y2="52"
                            stroke="#94a3b8"
                            strokeWidth="2"
                          />
                          <text
                            x="130"
                            y="72"
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="11"
                            transform={`rotate(${-angle} 130 72)`}
                          >
                            {value}
                          </text>
                        </g>
                      );
                    })}

                    <g
                      className="wp-needle"
                      style={{
                        transform: `rotate(${gaugeRotation}deg)`,
                        transformOrigin: "130px 140px",
                      }}
                    >
                      <path
                        d="M130 48 L138 146 L130 163 L122 146 Z"
                        fill="#475569"
                      />
                    </g>
                    <circle
                      cx="130"
                      cy="140"
                      r="16"
                      fill="#ffffff"
                      stroke="#94a3b8"
                      strokeWidth="2"
                    />
                    <circle cx="130" cy="140" r="5" fill="#38bdf8" />

                    <text
                      x="130"
                      y="213"
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="26"
                      fontWeight="700"
                    >
                      {metar?.windSpeed ?? "—"} kt
                    </text>
                    <text
                      x="130"
                      y="236"
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="12"
                    >
                      {metar?.windVariable
                        ? "VRB"
                        : hasWindDirection
                          ? `${metar!.windDirection!.toString().padStart(3, "0")}°`
                          : "—"}
                      {metar?.windGust ? ` · G${metar.windGust} kt` : ""}
                    </text>
                  </svg>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <Stat
                    label="Direction"
                    value={
                      metar?.windVariable
                        ? "VRB"
                        : hasWindDirection
                          ? `${metar!.windDirection!.toString().padStart(3, "0")}°`
                          : "—"
                    }
                    loading={loading}
                  />
                  <Stat
                    label="Gust"
                    value={metar?.windGust ? `${metar.windGust} kt` : "none"}
                    loading={loading}
                  />
                  <Stat
                    label="Wind speed"
                    value={formatValue(metar?.windSpeed ?? null, " kt")}
                    loading={loading}
                  />
                  <Stat
                    label="QNH"
                    value={formatValue(metar?.qnhHpa ?? null, " hPa")}
                    loading={loading}
                  />
                  <Stat
                    label="Temperature"
                    value={formatValue(metar?.temperatureC ?? null, " °C")}
                    loading={loading}
                  />
                  <Stat
                    label="Dew point"
                    value={formatValue(metar?.dewPointC ?? null, " °C")}
                    loading={loading}
                  />
                </dl>

                {metar?.variableFrom !== null &&
                  metar?.variableFrom !== undefined &&
                  metar?.variableTo !== null &&
                  metar?.variableTo !== undefined && (
                    <div className="wp-fade-in mt-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-center font-mono text-xs text-sky-700">
                      Variable {metar.variableFrom.toString().padStart(3, "0")}
                      °–{metar.variableTo.toString().padStart(3, "0")}°
                    </div>
                  )}
              </section>

              {/* Ceiling & visibility */}
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                      Ceiling and visibility
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Current values decoded from the METAR.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-semibold text-slate-900">
                    {metar?.cloudLabel ?? "—"}
                  </div>
                </div>

                <div className="relative mt-5 h-[250px] overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-sky-50 via-white to-slate-50">
                  {[5000, 4000, 3000, 2000, 1000, 0].map((value) => (
                    <div
                      key={value}
                      className="absolute inset-x-0 border-t border-dashed border-slate-200"
                      style={{ bottom: `${(value / 5000) * 100}%` }}
                    >
                      <span className="absolute left-2 -translate-y-1/2 rounded bg-white/95 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {value === 0 ? "0 ft" : value.toLocaleString()}
                      </span>
                    </div>
                  ))}

                  <div
                    className="absolute left-[72px] right-3 border-t-2 border-sky-400/70 transition-all duration-700 ease-out"
                    style={{ bottom: `${ceilingPercent}%` }}
                  >
                    <span className="absolute right-0 -translate-y-[calc(100%+6px)] rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-mono text-xs font-semibold text-sky-700">
                      {metar?.cavok
                        ? "CAVOK"
                        : metar?.ceilingFt
                          ? `${metar.ceilingFt.toLocaleString()} ft`
                          : "No ceiling"}
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-[72px] right-3">
                    <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <span>Visibility</span>
                      <span>
                        {metar?.visibilityKm !== null &&
                        metar?.visibilityKm !== undefined
                          ? `${metar.visibilityKm.toFixed(1)} km`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.min(100, ((metar?.visibilityKm ?? 0) / 10) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat
                    label="Visibility"
                    value={
                      metar?.visibilityKm !== null &&
                      metar?.visibilityKm !== undefined
                        ? `${metar.visibilityKm.toFixed(1)} km`
                        : "—"
                    }
                    loading={loading}
                  />
                  <Stat
                    label="Flight category"
                    value={metar?.category ?? "—"}
                    loading={loading}
                  />
                </div>
              </section>
            </div>

            <div className="grid gap-4 px-4 pb-4 sm:px-5 sm:pb-5 xl:grid-cols-[1fr]">
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">
                    Raw METAR
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {updatedAt
                      ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-700">
                  {metar?.raw ??
                    (loading ? `${icao} METAR loading…` : "No METAR available")}
                </pre>
              </div>
            </div>

          </article>
        </CardContent>
      </Card>

      <Card className="llsigwx-card mt-4 overflow-hidden border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <CardContent className="p-0">
          <article className="bg-white text-slate-900">
            <header className="llsigwx-card__header">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                  <FileText className="size-3.5" />
                  LLSIGWX
                </p>
              </div>
            </header>

            <PdfChartViewer
              src={LLSIGWX_PDF_PROXY_URL}
              title="LLSIGWX low-level significant weather chart"
            />
          </article>
        </CardContent>
      </Card>
    </section>
  );
}
