import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  CloudSun,
  ExternalLink,
  FileText,
  Printer,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  buildNotamRequest,
  fetchRouteNotams,
  type NotamItem,
} from "@/lib/notams";
import { parseOpenAir } from "@/lib/vfr/airspace";
import {
  analyzeRouteAirspaces,
  generateApproachBriefing,
  generateDepartureBriefing,
  generateRouteSummary,
  inferDepartureExitLeg,
  suggestVfrCruiseAltitude,
  type BriefingForm,
  type BriefingWeather,
  type FlightPlanSnapshot,
} from "@/lib/vfr/briefing";
import { Alert, AlertDescription } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Textarea } from "@/ui/textarea";

type Props = {
  plan: FlightPlanSnapshot | null;
};

type MetarProxyResponse = {
  station: string;
  distanceNm: number | null;
  observation: {
    rawOb?: string;
    reportTime?: string;
    obsTime?: number | string;
    wdir?: number | string | null;
    wspd?: number | null;
    wgst?: number | null;
    visib?: number | string | null;
    temp?: number | null;
    dewp?: number | null;
    altim?: number | null;
    clouds?: Array<{ cover?: string; base?: number | null }>;
  };
};

type WeatherStationsResponse = {
  stations?: Array<{
    icao?: string;
    rawTaf?: string | null;
    tafSegments?: BriefingWeather["tafSegments"];
  }>;
};

type RunwayOption = {
  id: string;
  heading: number;
  surface?: string;
  lengthFt?: number | null;
};

type AirportFrequency = {
  type: string;
  description: string;
  frequencyMhz: number;
};

type AirportOperationalData = {
  elevationFt: number | null;
  runways: RunwayOption[];
  frequencies: AirportFrequency[];
};

type AirportDbRecord = {
  elevation_ft?: string | number;
  freqs?: Array<{
    type?: string;
    description?: string;
    frequency_mhz?: string | number;
  }>;
  runways?: Array<{
    closed?: string;
    le_ident?: string;
    le_heading_degT?: string;
    he_ident?: string;
    he_heading_degT?: string;
    surface?: string;
    length_ft?: string;
  }>;
};

type RouteModelWeather = {
  pressureLevel: number;
  averageWindDirection: number;
  averageWindSpeedKt: number;
  averageTemperatureC: number;
  freezingLevelFt: number | null;
  sampleCount: number;
};

const DEFAULT_FORM: BriefingForm = {
  aircraftStatus: "",
  fuelOnBoard: "",
  notamStatus: "not-verified",
  notamSummary: "",
  expectedWeather: "",
  destinationExpectedWeather: "",
  departureIcao: "",
  destinationIcao: "",
  llsigwxSummary: "",
  routeWindTemp: "",
  freezingLevelFt: "",
  goNoGo: "not-set",
  goNoGoReason: "",
  departureRunway: "",
  chartNumber: "",
  circuitExit: "",
  initialAltitudeFt: "",
  cruiseAltitudeFt: "",
  com1Active: "",
  com1Standby: "",
  com2Active: "",
  com2Standby: "",
  squawk: "",
  qnh: "",
  taxiRoute: "",
  rotationSpeedKt: "",
  climbSpeedKt: "",
  runwayCondition: "not-set",
  runwayConditionOther: "",
  highestObstacleFt: "",
  routeThreats: "",
  destinationChartNumber: "",
  destinationCom: "",
  destinationRunway: "",
  destinationCircuitJoin: "",
  destinationCircuitAltitudeFt: "",
  destinationTaxiRoute: "",
  diversionFuel: "",
  diversionExtraTime: "",
};

function isIcao(value: string | undefined) {
  return Boolean(value && /^[A-Z0-9]{4}$/.test(value.toUpperCase()));
}

function parsePlannedUtc(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value.endsWith("Z") ? value : value + "Z");
  return Number.isFinite(date.getTime()) ? date : null;
}

function observedAt(observation: MetarProxyResponse["observation"]) {
  if (typeof observation.reportTime === "string") return observation.reportTime;
  const numeric = Number(observation.obsTime);
  return Number.isFinite(numeric)
    ? new Date(numeric * 1000).toISOString()
    : null;
}

function visibilityKm(value: number | string | null | undefined, raw: string) {
  if (/\bCAVOK\b/.test(raw)) return 10;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value * 1.609344;
  }
  if (typeof value === "string") {
    const number = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(number) ? number * 1.609344 : null;
  }
  return null;
}

function cloudDescription(
  clouds: MetarProxyResponse["observation"]["clouds"],
  raw: string,
) {
  if (/\bCAVOK\b/.test(raw)) return "CAVOK";
  if (/\b(?:NCD|NSC|SKC|CLR)\b/.test(raw)) return "no significant cloud";
  const usable = (clouds ?? []).filter(
    (cloud) => cloud.cover && typeof cloud.base === "number",
  );
  if (!usable.length) return "cloud information not reported";
  return usable
    .map((cloud) => cloud.cover + " " + Math.round(cloud.base ?? 0) + " feet")
    .join(", ");
}

function parseWeather(
  requestedIcao: string,
  payload: MetarProxyResponse,
  rawTaf: string | null,
  tafSegments: BriefingWeather["tafSegments"],
): BriefingWeather {
  const raw = payload.observation.rawOb?.trim() ?? "";
  const wdir = payload.observation.wdir;
  const numericWind = Number(wdir);
  const windDirection =
    String(wdir).toUpperCase() === "VRB"
      ? "VRB"
      : Number.isFinite(numericWind)
        ? numericWind
        : null;
  const cloudLayers = payload.observation.clouds ?? [];
  const ceilings = cloudLayers
    .filter(
      (cloud) =>
        ["BKN", "OVC", "VV"].includes((cloud.cover ?? "").toUpperCase()) &&
        typeof cloud.base === "number",
    )
    .map((cloud) => cloud.base as number);

  return {
    requestedIcao,
    station: payload.station,
    distanceNm: payload.distanceNm,
    rawMetar: raw,
    rawTaf,
    tafSegments,
    windDirection,
    windSpeedKt:
      typeof payload.observation.wspd === "number"
        ? payload.observation.wspd
        : null,
    windGustKt:
      typeof payload.observation.wgst === "number"
        ? payload.observation.wgst
        : null,
    visibilityKm: visibilityKm(payload.observation.visib, raw),
    ceilingFt: ceilings.length ? Math.min(...ceilings) : null,
    cloudText: cloudDescription(cloudLayers, raw),
    temperatureC:
      typeof payload.observation.temp === "number"
        ? payload.observation.temp
        : null,
    dewpointC:
      typeof payload.observation.dewp === "number"
        ? payload.observation.dewp
        : null,
    qnhHpa:
      typeof payload.observation.altim === "number"
        ? payload.observation.altim
        : null,
    observedAt: observedAt(payload.observation),
  };
}

async function fetchWeather(
  icao: string,
  lat: number,
  lon: number,
): Promise<BriefingWeather> {
  const query = new URLSearchParams({
    icao,
    lat: String(lat),
    lon: String(lon),
  });
  const response = await fetch("/api/metar?" + query.toString());
  if (!response.ok) throw new Error("METAR HTTP " + response.status);
  const payload = (await response.json()) as MetarProxyResponse;

  let rawTaf: string | null = null;
  let tafSegments: BriefingWeather["tafSegments"] = [];
  try {
    const stationsResponse = await fetch("/api/weather/stations");
    if (stationsResponse.ok) {
      const stationsPayload =
        (await stationsResponse.json()) as WeatherStationsResponse;
      const station = stationsPayload.stations?.find(
        (item) => item.icao === payload.station,
      );
      rawTaf = station?.rawTaf ?? null;
      tafSegments = station?.tafSegments ?? [];
    }
  } catch {
    rawTaf = null;
    tafSegments = [];
  }

  return parseWeather(icao, payload, rawTaf, tafSegments);
}

function parseHeading(value: string | undefined, ident: string | undefined) {
  const numeric =
    value === undefined || value.trim() === "" ? Number.NaN : Number(value);
  if (Number.isFinite(numeric)) return ((numeric % 360) + 360) % 360;
  const match = ident?.match(/^(\d{2})/);
  if (!match) return null;
  const heading = Number(match[1]) * 10;
  return heading === 360 ? 0 : heading;
}

async function fetchAirportData(icao: string): Promise<AirportOperationalData> {
  const urls = [
    "https://raw.githubusercontent.com/ZeroxyDev/runways-db/main/icao/" +
      icao +
      ".json",
    "https://raw.githubusercontent.com/epranka/airports-db/master/icao/" +
      icao +
      ".json",
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) continue;
      const record = (await response.json()) as AirportDbRecord;
      const runways: RunwayOption[] = [];
      for (const runway of record.runways ?? []) {
        if (runway.closed === "1") continue;
        const low = runway.le_ident?.trim();
        const high = runway.he_ident?.trim();
        const lowHeading = parseHeading(runway.le_heading_degT, low);
        const highHeading = parseHeading(runway.he_heading_degT, high);
        const length = Number(runway.length_ft);
        const common = {
          surface: runway.surface,
          lengthFt: Number.isFinite(length) ? length : null,
        };
        if (low && lowHeading != null) {
          runways.push({ id: low, heading: lowHeading, ...common });
        }
        if (high && highHeading != null) {
          runways.push({ id: high, heading: highHeading, ...common });
        }
      }

      const frequencies = (record.freqs ?? [])
        .map((freq) => ({
          type: (freq.type ?? "").trim().toUpperCase(),
          description: (freq.description ?? "").trim(),
          frequencyMhz: Number(freq.frequency_mhz),
        }))
        .filter((freq) => Number.isFinite(freq.frequencyMhz));

      const elevation = Number(record.elevation_ft);
      return {
        elevationFt: Number.isFinite(elevation) ? elevation : null,
        runways,
        frequencies,
      };
    } catch {
      // Try the next public airport database.
    }
  }

  return { elevationFt: null, runways: [], frequencies: [] };
}

function angleDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function preferredFrequency(data: AirportOperationalData | null) {
  if (!data?.frequencies.length) return null;
  const priority = ["AFIS", "TWR", "INFO", "CTAF", "UNICOM", "APP"];
  return [...data.frequencies].sort((a, b) => {
    const ai = priority.indexOf(a.type);
    const bi = priority.indexOf(b.type);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  })[0] ?? null;
}

function frequencyText(freq: AirportFrequency | null) {
  if (!freq) return "";
  return freq.frequencyMhz.toFixed(3);
}

function frequencyFromAirspaceName(name: string) {
  const match = name.match(/\b(1\d{2})[,.](\d{3})\b/);
  if (!match) return "";
  const value = Number(match[1] + "." + match[2]);
  if (!Number.isFinite(value) || value < 118 || value > 137) return "";
  return value.toFixed(3);
}

function tafSegmentAt(weather: BriefingWeather | null, at: Date | null) {
  if (!weather?.tafSegments?.length || !at) return null;
  const t = at.getTime();
  return (
    weather.tafSegments.find((segment) => {
      const from = segment.from ? Date.parse(segment.from) : Number.NEGATIVE_INFINITY;
      const to = segment.to ? Date.parse(segment.to) : Number.POSITIVE_INFINITY;
      return t >= from && t <= to;
    }) ??
    weather.tafSegments
      .filter((segment) => segment.from)
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.from!) - t) - Math.abs(Date.parse(b.from!) - t),
      )[0] ??
    null
  );
}

function windAt(weather: BriefingWeather | null, at: Date | null) {
  const taf = tafSegmentAt(weather, at);
  if (taf?.wind.direction != null) {
    return {
      direction: taf.wind.direction,
      speedKt: taf.wind.speedKt,
      gustKt: taf.wind.gustKt,
      source: "TAF",
    };
  }
  return {
    direction: weather?.windDirection ?? null,
    speedKt: weather?.windSpeedKt ?? null,
    gustKt: weather?.windGustKt ?? null,
    source: "METAR",
  };
}

function runwaySuggestion(
  runways: RunwayOption[],
  wind: {
    direction: number | "VRB" | null;
    speedKt: number | null;
  },
  routeCourse: number | null | undefined,
) {
  if (!runways.length) return null;
  const paved = runways.filter((runway) =>
    /ASPH|CONC|PAVED|BIT/i.test(runway.surface ?? ""),
  );
  const candidates = paved.length ? paved : runways;
  const useWind =
    typeof wind.direction === "number" && (wind.speedKt ?? 0) >= 3;
  const target = useWind ? wind.direction : routeCourse;
  if (target == null || !Number.isFinite(target)) return candidates[0] ?? null;
  return (
    [...candidates].sort(
      (a, b) =>
        angleDifference(a.heading, target) -
        angleDifference(b.heading, target),
    )[0] ?? null
  );
}

function weatherForecastSpeech(weather: BriefingWeather | null, at: Date | null) {
  const segment = tafSegmentAt(weather, at);
  if (!segment) {
    return weather?.rawTaf
      ? "TAF is available but no matching decoded segment was found; review the raw TAF"
      : "no TAF is available for the selected reporting station";
  }

  const parts: string[] = [];
  const wind = segment.wind;
  if (wind.direction === "VRB") {
    parts.push(
      "forecast wind variable" +
        (wind.speedKt == null ? "" : " " + Math.round(wind.speedKt) + " knots"),
    );
  } else if (wind.direction != null && wind.speedKt != null) {
    let text =
      "forecast wind " +
      Math.round(wind.direction).toString().padStart(3, "0") +
      " degrees " +
      Math.round(wind.speedKt) +
      " knots";
    if (wind.gustKt != null) text += " gusting " + Math.round(wind.gustKt);
    parts.push(text);
  }
  if (segment.visibilitySm != null) {
    parts.push(
      segment.visibilitySm >= 6
        ? "visibility 10 kilometres or more"
        : "visibility about " +
            (segment.visibilitySm * 1.609344).toFixed(1) +
            " kilometres",
    );
  }
  if (segment.weather) parts.push(segment.weather);
  if (segment.clouds.length) {
    parts.push(
      segment.clouds
        .map((cloud) =>
          cloud.baseFt == null
            ? cloud.cover
            : cloud.cover + " " + Math.round(cloud.baseFt) + " feet",
        )
        .join(", "),
    );
  }
  return parts.length ? parts.join(", ") : "no significant TAF items decoded";
}

function notamTime(value: string | undefined) {
  if (!value) return null;
  if (/^\d{10}$/.test(value)) {
    const yy = Number(value.slice(0, 2));
    const year = 2000 + yy;
    const iso =
      year +
      "-" +
      value.slice(2, 4) +
      "-" +
      value.slice(4, 6) +
      "T" +
      value.slice(6, 8) +
      ":" +
      value.slice(8, 10) +
      ":00Z";
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function notamsForWindow(
  notams: NotamItem[],
  start: Date | null,
  end: Date | null,
) {
  if (!start || !end) return notams;
  return notams.filter((notam) => {
    const from = notamTime(notam.effectiveStart) ?? Number.NEGATIVE_INFINITY;
    const to = notamTime(notam.effectiveEnd) ?? Number.POSITIVE_INFINITY;
    return from <= end.getTime() && to >= start.getTime();
  });
}

function summarizeNotams(notams: NotamItem[], limit = 4) {
  if (!notams.length) return "";
  return notams
    .slice(0, limit)
    .map((notam) => {
      const location = notam.location ? notam.location + ": " : "";
      return location + notam.text.replace(/\s+/g, " ").trim();
    })
    .join("; ");
}

function pressureLevelForAltitude(altitudeFt: number) {
  if (altitudeFt <= 3500) return 925;
  if (altitudeFt <= 7500) return 850;
  return 700;
}

function nearestHourlyIndex(times: string[], at: Date) {
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const parsed = Date.parse(time.endsWith("Z") ? time : time + "Z");
    const diff = Math.abs(parsed - at.getTime());
    if (diff < bestDiff) {
      best = index;
      bestDiff = diff;
    }
  });
  return best;
}

function hourlyNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchRouteModelWeather(
  plan: FlightPlanSnapshot,
  departure: Date,
  cruiseAltitudeFt: number,
): Promise<RouteModelWeather> {
  const level = pressureLevelForAltitude(cruiseAltitudeFt);
  const sampleIndexes = Array.from(
    new Set([
      0,
      Math.floor((plan.waypoints.length - 1) / 2),
      plan.waypoints.length - 1,
    ]),
  );
  const samples = await Promise.all(
    sampleIndexes.map(async (index, samplePosition) => {
      const waypoint = plan.waypoints[index]!;
      const progress =
        sampleIndexes.length <= 1 ? 0 : samplePosition / (sampleIndexes.length - 1);
      const at = new Date(
        departure.getTime() + progress * plan.totalTimeHours * 3600_000,
      );
      const hourlyNames = [
        "temperature_" + level + "hPa",
        "wind_speed_" + level + "hPa",
        "wind_direction_" + level + "hPa",
        "freezing_level_height",
      ];
      const query = new URLSearchParams({
        latitude: String(waypoint.lat),
        longitude: String(waypoint.lon),
        hourly: hourlyNames.join(","),
        wind_speed_unit: "kn",
        timezone: "UTC",
        forecast_days: "7",
      });
      const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?" + query.toString(),
      );
      if (!response.ok) throw new Error("Route weather model HTTP " + response.status);
      const payload = (await response.json()) as {
        hourly?: Record<string, Array<number | string | null>>;
      };
      const hourly = payload.hourly ?? {};
      const times = (hourly.time ?? []).map(String);
      if (!times.length) throw new Error("Route weather model returned no hourly data.");
      const firstTime = Date.parse(
        times[0]!.endsWith("Z") ? times[0]! : times[0]! + "Z",
      );
      const lastTime = Date.parse(
        times[times.length - 1]!.endsWith("Z")
          ? times[times.length - 1]!
          : times[times.length - 1]! + "Z",
      );
      if (at.getTime() < firstTime || at.getTime() > lastTime) {
        throw new Error("Planned flight time is outside the available route-weather forecast range.");
      }

      const i = nearestHourlyIndex(times, at);
      const temperature = hourlyNumber(
        hourly["temperature_" + level + "hPa"]?.[i],
      );
      const windSpeed = hourlyNumber(
        hourly["wind_speed_" + level + "hPa"]?.[i],
      );
      const windDirection = hourlyNumber(
        hourly["wind_direction_" + level + "hPa"]?.[i],
      );
      const freezingMeters = hourlyNumber(hourly.freezing_level_height?.[i]);
      return {
        temperature,
        windSpeed,
        windDirection,
        freezingLevelFt:
          freezingMeters == null ? null : freezingMeters * 3.28084,
      };
    }),
  );

  const valid = samples.filter(
    (
      sample,
    ): sample is {
      temperature: number;
      windSpeed: number;
      windDirection: number;
      freezingLevelFt: number | null;
    } =>
      sample.temperature != null &&
      sample.windSpeed != null &&
      sample.windDirection != null,
  );
  if (!valid.length) throw new Error("Route weather model returned incomplete data.");

  const avgTemp =
    valid.reduce((sum, sample) => sum + sample.temperature, 0) / valid.length;
  const avgWind =
    valid.reduce((sum, sample) => sum + sample.windSpeed, 0) / valid.length;
  const x =
    valid.reduce(
      (sum, sample) => sum + Math.cos((sample.windDirection * Math.PI) / 180),
      0,
    ) / valid.length;
  const y =
    valid.reduce(
      (sum, sample) => sum + Math.sin((sample.windDirection * Math.PI) / 180),
      0,
    ) / valid.length;
  const avgDirection = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const freezing = valid
    .map((sample) => sample.freezingLevelFt)
    .filter((value): value is number => value != null && Number.isFinite(value));

  return {
    pressureLevel: level,
    averageWindDirection: avgDirection,
    averageWindSpeedKt: avgWind,
    averageTemperatureC: avgTemp,
    freezingLevelFt: freezing.length
      ? freezing.reduce((sum, value) => sum + value, 0) / freezing.length
      : null,
    sampleCount: valid.length,
  };
}

function statusBadge(ok: boolean, label: string, warning?: string) {
  return (
    <Badge
      variant={ok ? "secondary" : "outline"}
      className={ok ? "gap-1.5" : "gap-1.5 text-amber-700"}
      title={warning}
    >
      {ok ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <AlertTriangle className="size-3" />
      )}
      {label}
    </Badge>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = "brief-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="field-label">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function AutoRow({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 border-b border-border py-2 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <div>
        <span className="font-mono font-semibold">{value || "—"}</span>
        {source && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            {source}
          </span>
        )}
      </div>
    </div>
  );
}

export function BriefingPanel({ plan }: Props) {
  const [form, setForm] = useState<BriefingForm>(DEFAULT_FORM);
  const [plannedDepartureUtc, setPlannedDepartureUtc] = useState("");
  const [departureWeather, setDepartureWeather] =
    useState<BriefingWeather | null>(null);
  const [destinationWeather, setDestinationWeather] =
    useState<BriefingWeather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [airspaceText, setAirspaceText] = useState("");
  const [airspaceError, setAirspaceError] = useState("");
  const [departureAirport, setDepartureAirport] =
    useState<AirportOperationalData | null>(null);
  const [destinationAirport, setDestinationAirport] =
    useState<AirportOperationalData | null>(null);
  const [notams, setNotams] = useState<NotamItem[]>([]);
  const [notamError, setNotamError] = useState("");
  const [notamLoading, setNotamLoading] = useState(false);
  const [routeModel, setRouteModel] = useState<RouteModelWeather | null>(null);
  const [routeModelError, setRouteModelError] = useState("");
  const [activeTab, setActiveTab] = useState<"departure" | "route" | "approach">(
    "departure",
  );

  const departure = plan?.waypoints[0];
  const destination = plan
    ? plan.waypoints[plan.waypoints.length - 1]
    : undefined;
  const departureIcao = isIcao(form.departureIcao)
    ? form.departureIcao.toUpperCase()
    : isIcao(departure?.label)
      ? departure!.label.toUpperCase()
      : "";
  const destinationIcao = isIcao(form.destinationIcao)
    ? form.destinationIcao.toUpperCase()
    : isIcao(destination?.label)
      ? destination!.label.toUpperCase()
      : "";
  const plannedDeparture = parsePlannedUtc(plannedDepartureUtc);
  const plannedArrival =
    plannedDeparture && plan
      ? new Date(
          plannedDeparture.getTime() + plan.totalTimeHours * 3600_000,
        )
      : null;

  function update<K extends keyof BriefingForm>(
    key: K,
    value: BriefingForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function refreshWeather() {
    if (!plan || !departure || !destination) return;
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const [dep, dest] = await Promise.all([
        departureIcao
          ? fetchWeather(departureIcao, departure.lat, departure.lon)
          : Promise.resolve(null),
        destinationIcao
          ? fetchWeather(destinationIcao, destination.lat, destination.lon)
          : Promise.resolve(null),
      ]);
      setDepartureWeather(dep);
      setDestinationWeather(dest);
      if (!dep && !dest) {
        setWeatherError(
          "Automatic weather lookup needs ICAO-coded departure and destination aerodromes.",
        );
      }
    } catch (error) {
      setWeatherError(
        error instanceof Error ? error.message : "Weather lookup failed.",
      );
    } finally {
      setWeatherLoading(false);
    }
  }

  async function refreshNotams() {
    if (!plan) return;
    setNotamLoading(true);
    setNotamError("");
    try {
      const items = await fetchRouteNotams(buildNotamRequest(plan.waypoints, 10));
      setNotams(items);
    } catch (error) {
      setNotams([]);
      setNotamError(
        error instanceof Error ? error.message : "Automatic NOTAM lookup failed.",
      );
    } finally {
      setNotamLoading(false);
    }
  }

  useEffect(() => {
    void refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    departureIcao,
    destinationIcao,
    departure?.lat,
    departure?.lon,
    destination?.lat,
    destination?.lon,
  ]);

  useEffect(() => {
    void refreshNotams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.waypoints]);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/airspace/hungary-openair-2026v2.txt")
      .then((response) => {
        if (!response.ok) throw new Error("OpenAIR HTTP " + response.status);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setAirspaceText(text);
          setAirspaceError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAirspaceText("");
          setAirspaceError(
            error instanceof Error ? error.message : "Airspace data failed.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!departureIcao) {
      setDepartureAirport(null);
      return;
    }
    void fetchAirportData(departureIcao).then((data) => {
      if (!cancelled) setDepartureAirport(data);
    });
    return () => {
      cancelled = true;
    };
  }, [departureIcao]);

  useEffect(() => {
    let cancelled = false;
    if (!destinationIcao) {
      setDestinationAirport(null);
      return;
    }
    void fetchAirportData(destinationIcao).then((data) => {
      if (!cancelled) setDestinationAirport(data);
    });
    return () => {
      cancelled = true;
    };
  }, [destinationIcao]);

  const autoCruiseAltitude =
    suggestVfrCruiseAltitude(plan?.legs[0]?.magneticCourse) ?? null;
  const resolvedCruiseAltitude = Number(
    form.cruiseAltitudeFt || autoCruiseAltitude || 0,
  );

  useEffect(() => {
    if (!plan || !plannedDeparture || !resolvedCruiseAltitude) {
      setRouteModel(null);
      return;
    }
    let cancelled = false;
    setRouteModelError("");
    void fetchRouteModelWeather(
      plan,
      plannedDeparture,
      resolvedCruiseAltitude,
    )
      .then((data) => {
        if (!cancelled) setRouteModel(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setRouteModel(null);
          setRouteModelError(
            error instanceof Error
              ? error.message
              : "Route weather model failed.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plan, plannedDepartureUtc, resolvedCruiseAltitude]);

  const parsedAirspaces = useMemo(
    () => (airspaceText ? parseOpenAir(airspaceText) : []),
    [airspaceText],
  );
  const airspaces = useMemo(() => {
    if (!plan || !parsedAirspaces.length) return [];
    return analyzeRouteAirspaces(
      plan.waypoints,
      parsedAirspaces,
      5,
      resolvedCruiseAltitude || null,
    );
  }, [plan, parsedAirspaces, resolvedCruiseAltitude]);

  const departureWind = windAt(departureWeather, plannedDeparture);
  const destinationWind = windAt(destinationWeather, plannedArrival);
  const departureRunwayUsesWind =
    typeof departureWind.direction === "number" &&
    (departureWind.speedKt ?? 0) >= 3;
  const destinationRunwayUsesWind =
    typeof destinationWind.direction === "number" &&
    (destinationWind.speedKt ?? 0) >= 3;
  const departureRunwaySuggestion = runwaySuggestion(
    departureAirport?.runways ?? [],
    departureWind,
    plan?.legs[0]?.trueCourse,
  );
  const destinationRunwaySuggestion = runwaySuggestion(
    destinationAirport?.runways ?? [],
    destinationWind,
    plan?.legs[plan.legs.length - 1]?.trueCourse,
  );

  const resolvedDepartureRunway =
    form.departureRunway || departureRunwaySuggestion?.id || "";
  const selectedDepartureRunway =
    departureAirport?.runways.find(
      (runway) => runway.id === resolvedDepartureRunway,
    ) ?? departureRunwaySuggestion;
  const resolvedCircuitExit =
    form.circuitExit ||
    inferDepartureExitLeg(
      selectedDepartureRunway?.heading,
      plan?.legs[0]?.trueCourse,
    ) ||
    "";

  const depFrequency = preferredFrequency(departureAirport);
  const destFrequency = preferredFrequency(destinationAirport);
  const nextRouteAirspaceFrequency =
    airspaces
      .filter((item) => item.verticalStatus !== "outside")
      .map((item) => frequencyFromAirspaceName(item.name))
      .find(Boolean) ?? "";
  const activeNotams = notamsForWindow(notams, plannedDeparture, plannedArrival);
  const automaticThreats = useMemo(() => {
    const threats: string[] = [];
    const relevantAirspaces = airspaces.filter(
      (item) => item.verticalStatus !== "outside",
    );
    if (relevantAirspaces.length) {
      threats.push(
        "airspace: " +
          relevantAirspaces
            .slice(0, 4)
            .map((item) => item.name)
            .join(", "),
      );
    }
    if (
      departureWeather?.windGustKt != null &&
      departureWeather.windGustKt >= 20
    ) {
      threats.push(
        "departure gusts up to " +
          Math.round(departureWeather.windGustKt) +
          " knots",
      );
    }
    if (
      destinationWeather?.windGustKt != null &&
      destinationWeather.windGustKt >= 20
    ) {
      threats.push(
        "destination gusts up to " +
          Math.round(destinationWeather.windGustKt) +
          " knots",
      );
    }
    if (
      departureWeather?.ceilingFt != null &&
      departureWeather.ceilingFt < 3000
    ) {
      threats.push(
        "departure ceiling " + Math.round(departureWeather.ceilingFt) + " feet",
      );
    }
    if (
      destinationWeather?.ceilingFt != null &&
      destinationWeather.ceilingFt < 3000
    ) {
      threats.push(
        "destination ceiling " +
          Math.round(destinationWeather.ceilingFt) +
          " feet",
      );
    }
    if (routeModel && routeModel.averageWindSpeedKt >= 20) {
      threats.push(
        "route wind about " +
          Math.round(routeModel.averageWindSpeedKt) +
          " knots",
      );
    }
    if (activeNotams.length) {
      threats.push(activeNotams.length + " time-relevant aerodrome NOTAM(s)");
    }
    threats.push("terrain/obstacle clearance must be verified on current chart");
    return threats.join("; ");
  }, [
    airspaces,
    departureWeather,
    destinationWeather,
    routeModel,
    activeNotams,
  ]);

  const resolvedForm = useMemo<BriefingForm>(() => {
    const expectedWeather = weatherForecastSpeech(
      departureWeather,
      plannedDeparture,
    );
    const modelWind =
      routeModel == null
        ? ""
        : Math.round(routeModel.averageWindDirection)
            .toString()
            .padStart(3, "0") +
          " degrees / " +
          Math.round(routeModel.averageWindSpeedKt) +
          " knots, " +
          Math.round(routeModel.averageTemperatureC) +
          " degrees Celsius at approximately " +
          routeModel.pressureLevel +
          " hPa";

    return {
      ...form,
      notamStatus:
        !plannedDeparture || notamError || notamLoading
          ? "not-verified"
          : activeNotams.length
            ? "auto-partial-relevant"
            : "auto-partial-none",
      notamSummary:
        form.notamSummary ||
        (plannedDeparture ? summarizeNotams(activeNotams) : "") ||
        "",
      expectedWeather:
        form.expectedWeather || expectedWeather,
      destinationExpectedWeather:
        form.destinationExpectedWeather ||
        weatherForecastSpeech(destinationWeather, plannedArrival),
      chartNumber:
        form.chartNumber ||
        (departureIcao ? "AD 2-" + departureIcao + "-VAC" : ""),
      destinationChartNumber:
        form.destinationChartNumber ||
        (destinationIcao ? "AD 2-" + destinationIcao + "-VAC" : ""),
      departureRunway: resolvedDepartureRunway,
      destinationRunway:
        form.destinationRunway || destinationRunwaySuggestion?.id || "",
      circuitExit: resolvedCircuitExit,
      cruiseAltitudeFt:
        form.cruiseAltitudeFt ||
        (autoCruiseAltitude == null ? "" : String(autoCruiseAltitude)),
      com1Active: form.com1Active || frequencyText(depFrequency),
      com1Standby:
        form.com1Standby ||
        nextRouteAirspaceFrequency ||
        frequencyText(destFrequency),
      destinationCom:
        form.destinationCom || frequencyText(destFrequency),
      com2Active: form.com2Active || "121.500",
      com2Standby:
        form.com2Standby || frequencyText(destFrequency),
      squawk: form.squawk || "7000",
      qnh:
        form.qnh ||
        (departureWeather?.station === departureIcao &&
        departureWeather.qnhHpa != null
          ? String(Math.round(departureWeather.qnhHpa))
          : ""),
      routeWindTemp: form.routeWindTemp || modelWind,
      freezingLevelFt:
        form.freezingLevelFt ||
        (routeModel?.freezingLevelFt == null
          ? ""
          : String(Math.round(routeModel.freezingLevelFt))),
      routeThreats: form.routeThreats || automaticThreats,
    };
  }, [
    form,
    departureWeather,
    destinationWeather,
    plannedDeparture,
    plannedArrival,
    routeModel,
    departureIcao,
    destinationIcao,
    resolvedDepartureRunway,
    destinationRunwaySuggestion,
    resolvedCircuitExit,
    autoCruiseAltitude,
    depFrequency,
    destFrequency,
    nextRouteAirspaceFrequency,
    notamError,
    notamLoading,
    activeNotams,
    automaticThreats,
  ]);

  const departureBriefing = useMemo(
    () =>
      generateDepartureBriefing({
        plan,
        form: resolvedForm,
        weather: departureWeather,
      }),
    [plan, resolvedForm, departureWeather],
  );
  const routeBriefing = useMemo(
    () =>
      generateRouteSummary({
        plan,
        form: resolvedForm,
        departureWeather,
        destinationWeather,
        airspaces,
        airspaceDataLoaded: Boolean(airspaceText),
      }),
    [
      plan,
      resolvedForm,
      departureWeather,
      destinationWeather,
      airspaces,
      airspaceText,
    ],
  );
  const approachBriefing = useMemo(
    () =>
      generateApproachBriefing({
        plan,
        form: resolvedForm,
        weather: destinationWeather,
      }),
    [plan, resolvedForm, destinationWeather],
  );

  const briefingText =
    activeTab === "departure"
      ? departureBriefing
      : activeTab === "route"
        ? routeBriefing
        : approachBriefing;

  const missing: string[] = [];
  if (!plannedDeparture) missing.push("planned departure UTC");
  if (!resolvedForm.aircraftStatus.trim())
    missing.push("aircraft technical status");
  if (!resolvedForm.fuelOnBoard.trim()) missing.push("fuel on board");
  if (!resolvedForm.rotationSpeedKt.trim()) missing.push("Vr");
  if (!resolvedForm.climbSpeedKt.trim()) missing.push("climb speed");
  if (resolvedForm.runwayCondition === "not-set")
    missing.push("runway condition");
  if (!resolvedForm.taxiRoute.trim()) missing.push("taxi route");
  if (!resolvedForm.com1Active.trim()) missing.push("departure ATS frequency");
  if (!resolvedForm.com1Standby.trim()) missing.push("next/standby ATS frequency");
  if (!resolvedForm.qnh.trim()) missing.push("local QNH");
  if (!resolvedForm.llsigwxSummary.trim()) missing.push("LLSIGWX review");
  if (resolvedForm.goNoGo === "not-set") missing.push("GO / NO-GO decision");
  if (!departureIcao) missing.push("departure ICAO");
  if (!destinationIcao) missing.push("destination ICAO");
  if (!resolvedForm.departureRunway.trim()) missing.push("departure runway");

  if (!plan) {
    return (
      <section id="briefing">
        <Card>
          <CardHeader>
            <CardTitle className="panel-heading flex items-center gap-2">
              <FileText className="size-4" />
              Advanced CPL VFR briefing
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Calculate a route in Planner first. The briefing is generated
                from the current calculated flight plan.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section id="briefing" className="space-y-4 lg:space-y-6">
      <Card>
        <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="panel-heading flex items-center gap-2">
                <Sparkles className="size-4" />
                Auto Advanced CPL VFR briefing
              </CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                {plan.waypoints.map((waypoint) => waypoint.label).join(" → ")}
              </p>
            </div>
            <Badge variant="outline">route-derived / ANWB</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {statusBadge(Boolean(departureIcao), "Departure airport")}
            {statusBadge(Boolean(destinationIcao), "Destination airport")}
            {statusBadge(Boolean(departureWeather), "METAR/TAF", weatherError)}
            {statusBadge(Boolean(routeModel), "Route wind/temp", routeModelError)}
            {statusBadge(Boolean(airspaceText), "Airspaces", airspaceError)}
            {statusBadge(!notamError && !notamLoading, "NOTAM", notamError)}
            {statusBadge(Boolean(resolvedForm.departureRunway), "Runway")}
            {statusBadge(missing.length === 0, "Briefing complete")}
          </div>

          <Alert>
            <ShieldAlert className="size-4" />
            <AlertDescription>
              The page now derives everything it reasonably can from the route
              and live/planning data. Only genuinely flight-specific or
              non-inferable items remain for the student. OpenAIR, public airport
              data and model weather are planning aids; current AIP, official
              NOTAM briefing and operational weather remain the controlling
              sources.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">
                Only data the route cannot know
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <Field
                label="Planned departure UTC"
                type="datetime-local"
                value={plannedDepartureUtc}
                onChange={setPlannedDepartureUtc}
              />

              {!departureIcao && (
                <Field
                  label="Departure ICAO"
                  value={form.departureIcao}
                  onChange={(value) =>
                    update("departureIcao", value.toUpperCase())
                  }
                />
              )}
              {!destinationIcao && (
                <Field
                  label="Destination ICAO"
                  value={form.destinationIcao}
                  onChange={(value) =>
                    update("destinationIcao", value.toUpperCase())
                  }
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Aircraft technical status"
                  value={form.aircraftStatus}
                  onChange={(value) => update("aircraftStatus", value)}
                  placeholder="e.g. normal / deferred defect if applicable"
                />
                <Field
                  label="Fuel on board"
                  value={form.fuelOnBoard}
                  onChange={(value) => update("fuelOnBoard", value)}
                  placeholder="e.g. 28 US gal"
                />
                <Field
                  label="Vr (kt)"
                  type="number"
                  value={form.rotationSpeedKt}
                  onChange={(value) => update("rotationSpeedKt", value)}
                />
                <Field
                  label="Climb speed (kt)"
                  type="number"
                  value={form.climbSpeedKt}
                  onChange={(value) => update("climbSpeedKt", value)}
                />
                <Field
                  label="Expected taxi routing"
                  value={form.taxiRoute}
                  onChange={(value) => update("taxiRoute", value)}
                  placeholder="Depends on stand / AFIS instruction"
                />
                {!resolvedForm.com1Active && (
                  <Field
                    label="Departure ATS frequency"
                    value={form.com1Active}
                    onChange={(value) => update("com1Active", value)}
                    placeholder="Enter if airport database has no AFIS/TWR frequency"
                  />
                )}
                {!resolvedForm.com1Standby && (
                  <Field
                    label="Next / standby ATS frequency"
                    value={form.com1Standby}
                    onChange={(value) => update("com1Standby", value)}
                    placeholder="Enter if no route-airspace frequency can be derived"
                  />
                )}
                {!resolvedForm.qnh && (
                  <Field
                    label="Local QNH"
                    value={form.qnh}
                    onChange={(value) => update("qnh", value)}
                    placeholder={
                      departureWeather?.qnhHpa != null
                        ? "Nearest station planning QNH: " +
                          Math.round(departureWeather.qnhHpa)
                        : "Enter local/cleared QNH"
                    }
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="field-label">Runway condition</Label>
                <Select
                  value={form.runwayCondition}
                  onValueChange={(value) =>
                    update(
                      "runwayCondition",
                      value as BriefingForm["runwayCondition"],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-set">Not set</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
                    <SelectItem value="wet">Wet</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.runwayCondition === "other" && (
                <Field
                  label="Runway condition detail"
                  value={form.runwayConditionOther}
                  onChange={(value) => update("runwayConditionOther", value)}
                />
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="field-label">
                    LL SIGWX visual review — only relevant phenomena
                  </Label>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href="/api/weather/llsigwx.pdf"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      Open current chart
                    </a>
                  </Button>
                </div>
                <Textarea
                  className="min-h-[80px]"
                  value={form.llsigwxSummary}
                  onChange={(event) =>
                    update("llsigwxSummary", event.target.value)
                  }
                  placeholder="The chart is graphical, so only this visual weather assessment remains manual."
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update(
                      "llsigwxSummary",
                      "No significant LL SIGWX phenomena identified as relevant to the planned route after chart review",
                    )
                  }
                >
                  Mark reviewed — no relevant phenomena
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label className="field-label">GO / NO-GO</Label>
                  <Select
                    value={form.goNoGo}
                    onValueChange={(value) =>
                      update("goNoGo", value as BriefingForm["goNoGo"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-set">Not set</SelectItem>
                      <SelectItem value="go">GO</SelectItem>
                      <SelectItem value="no-go">NO-GO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="Decision reasoning"
                  value={form.goNoGoReason}
                  onChange={(value) => update("goNoGoReason", value)}
                  placeholder="Pilot judgement / school minima"
                />
              </div>

              {missing.length > 0 && (
                <Alert>
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    Still needed: {missing.join(", ")}.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">Automatically derived</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <AutoRow
                label="Departure"
                value={departureIcao || departure?.label || "—"}
                source="route"
              />
              <AutoRow
                label="Destination"
                value={destinationIcao || destination?.label || "—"}
                source="route"
              />
              <AutoRow
                label="Cruise altitude"
                value={
                  resolvedForm.cruiseAltitudeFt
                    ? resolvedForm.cruiseAltitudeFt + " ft"
                    : "—"
                }
                source="semicircular suggestion"
              />
              <AutoRow
                label="Departure RWY"
                value={resolvedForm.departureRunway}
                source={
                  departureRunwayUsesWind
                    ? departureWind.source + " wind"
                    : "route alignment / light wind"
                }
              />
              <AutoRow
                label="Exit leg"
                value={resolvedForm.circuitExit}
                source="RWY + first leg"
              />
              <AutoRow
                label="VAC"
                value={resolvedForm.chartNumber}
                source="AIP naming"
              />
              <AutoRow
                label="COM1 active"
                value={resolvedForm.com1Active}
                source={
                  depFrequency
                    ? (depFrequency.type || "airport") + " database"
                    : undefined
                }
              />
              <AutoRow
                label="COM1 standby"
                value={resolvedForm.com1Standby}
                source={
                  nextRouteAirspaceFrequency
                    ? "first route airspace"
                    : destFrequency
                      ? "destination fallback"
                      : undefined
                }
              />
              <AutoRow
                label="COM2"
                value={
                  resolvedForm.com2Active || resolvedForm.com2Standby
                    ? resolvedForm.com2Active +
                      " / " +
                      resolvedForm.com2Standby
                    : ""
                }
                source="guard / destination"
              />
              <AutoRow
                label="QNH"
                value={resolvedForm.qnh}
                source={departureWeather?.station}
              />
              <AutoRow
                label="Squawk"
                value={resolvedForm.squawk}
                source="VFR default / as assigned"
              />
              <AutoRow
                label="Route wind/temp"
                value={resolvedForm.routeWindTemp}
                source={
                  routeModel
                    ? "Open-Meteo model, " +
                      routeModel.sampleCount +
                      " route samples"
                    : undefined
                }
              />
              <AutoRow
                label="0°C level"
                value={
                  resolvedForm.freezingLevelFt
                    ? resolvedForm.freezingLevelFt + " ft"
                    : "—"
                }
                source="model"
              />
              <AutoRow
                label="NOTAMs"
                value={
                  notamLoading
                    ? "loading"
                    : notamError
                      ? "provider unavailable"
                      : activeNotams.length
                        ? activeNotams.length + " relevant in flight window"
                        : "no aerodrome NOTAMs in flight window"
                }
                source="automatic"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshWeather}
                  disabled={weatherLoading}
                >
                  <RefreshCw
                    className={
                      "size-4 " + (weatherLoading ? "animate-spin" : "")
                    }
                  />
                  Refresh weather
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshNotams}
                  disabled={notamLoading}
                >
                  <RefreshCw
                    className={
                      "size-4 " + (notamLoading ? "animate-spin" : "")
                    }
                  />
                  Refresh NOTAM
                </Button>
              </div>
            </CardContent>
          </Card>

          <details className="rounded-md border border-border bg-background">
            <summary className="cursor-pointer px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.12em]">
              Manual overrides / exceptional cases
            </summary>
            <div className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2">
              <Field
                label="Cruise altitude override (ft)"
                type="number"
                value={form.cruiseAltitudeFt}
                onChange={(value) => update("cruiseAltitudeFt", value)}
              />
              <Field
                label="Departure runway override"
                value={form.departureRunway}
                onChange={(value) => update("departureRunway", value)}
              />
              <Field
                label="Circuit exit override"
                value={form.circuitExit}
                onChange={(value) => update("circuitExit", value)}
              />
              <Field
                label="Initial altitude restriction (ft)"
                type="number"
                value={form.initialAltitudeFt}
                onChange={(value) => update("initialAltitudeFt", value)}
              />
              <Field
                label="COM1 active override"
                value={form.com1Active}
                onChange={(value) => update("com1Active", value)}
              />
              <Field
                label="QNH override"
                value={form.qnh}
                onChange={(value) => update("qnh", value)}
              />
              <Field
                label="Highest obstacle ±5 NM (optional)"
                type="number"
                value={form.highestObstacleFt}
                onChange={(value) => update("highestObstacleFt", value)}
              />
              <div className="sm:col-span-2">
                <Label className="field-label">Threat override</Label>
                <Textarea
                  className="mt-1.5"
                  value={form.routeThreats}
                  onChange={(event) =>
                    update("routeThreats", event.target.value)
                  }
                  placeholder={automaticThreats}
                />
              </div>
            </div>
          </details>

          {activeTab === "approach" && (
            <Card>
              <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
                <CardTitle className="panel-heading">
                  Approach-only non-inferable data
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <Field
                  label="Destination circuit join"
                  value={form.destinationCircuitJoin}
                  onChange={(value) =>
                    update("destinationCircuitJoin", value)
                  }
                />
                <Field
                  label="Circuit / target altitude (ft)"
                  type="number"
                  value={form.destinationCircuitAltitudeFt}
                  onChange={(value) =>
                    update("destinationCircuitAltitudeFt", value)
                  }
                />
                <Field
                  label="Taxi after landing"
                  value={form.destinationTaxiRoute}
                  onChange={(value) =>
                    update("destinationTaxiRoute", value)
                  }
                />
                <Field
                  label="Minimum diversion fuel"
                  value={form.diversionFuel}
                  onChange={(value) => update("diversionFuel", value)}
                />
                <Field
                  label="Diversion extra time"
                  value={form.diversionExtraTime}
                  onChange={(value) =>
                    update("diversionExtraTime", value)
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="xl:sticky xl:top-4">
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="panel-heading">Instructor-ready text</CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(briefingText)
                    }
                  >
                    <Clipboard className="size-4" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.print()}
                  >
                    <Printer className="size-4" />
                    Print
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={activeTab === "departure" ? "default" : "outline"}
                  onClick={() => setActiveTab("departure")}
                >
                  Departure
                </Button>
                <Button
                  variant={activeTab === "route" ? "default" : "outline"}
                  onClick={() => setActiveTab("route")}
                >
                  Route
                </Button>
                <Button
                  variant={activeTab === "approach" ? "default" : "outline"}
                  onClick={() => setActiveTab("approach")}
                >
                  Approach
                </Button>
              </div>
              <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-4 font-mono text-xs leading-6">
                {briefingText}
              </pre>
            </CardContent>
          </Card>

          {(departureWeather?.rawMetar || destinationWeather?.rawMetar) && (
            <Card>
              <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
                <CardTitle className="panel-heading">Weather source data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 font-mono text-[11px] sm:p-5">
                {departureWeather && (
                  <div>
                    <strong>
                      DEP {departureWeather.station}
                      {departureWeather.station !== departureIcao
                        ? " (nearest station)"
                        : ""}
                    </strong>
                    <pre className="mt-1 whitespace-pre-wrap">
                      {departureWeather.rawMetar || "No METAR"}
                    </pre>
                    <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {departureWeather.rawTaf || "No TAF"}
                    </pre>
                  </div>
                )}
                {destinationWeather && (
                  <div>
                    <strong>
                      DEST {destinationWeather.station}
                      {destinationWeather.station !== destinationIcao
                        ? " (nearest station)"
                        : ""}
                    </strong>
                    <pre className="mt-1 whitespace-pre-wrap">
                      {destinationWeather.rawMetar || "No METAR"}
                    </pre>
                    <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {destinationWeather.rawTaf || "No TAF"}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">
                Detected airspaces ±5 NM
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {airspaceError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>{airspaceError}</AlertDescription>
                </Alert>
              ) : airspaces.length ? (
                <div className="space-y-2">
                  {airspaces.slice(0, 20).map((airspace) => (
                    <div
                      key={
                        airspace.name +
                        airspace.lowerLimit +
                        airspace.upperLimit
                      }
                      className="rounded-md border border-border p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{airspace.name}</strong>
                        <Badge variant="outline">
                          {airspace.type || airspace.classCode || "airspace"}
                        </Badge>
                        <Badge
                          variant={
                            airspace.verticalStatus === "inside"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {airspace.verticalStatus}
                        </Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {airspace.lowerLimit || "?"} –{" "}
                        {airspace.upperLimit || "?"} · corridor distance{" "}
                        {airspace.distanceNm.toFixed(1)} NM
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No airspace detected in the loaded dataset for the 5 NM route
                  corridor.
                </p>
              )}
            </CardContent>
          </Card>

          {notamError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{notamError}</AlertDescription>
            </Alert>
          )}
          {routeModelError && (
            <Alert>
              <CloudSun className="size-4" />
              <AlertDescription>{routeModelError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </section>
  );
}

export default BriefingPanel;
