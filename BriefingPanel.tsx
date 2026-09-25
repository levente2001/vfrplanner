import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  CloudSun,
  FileText,
  MapPin,
  Printer,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { parseNotamBriefing } from "@/lib/notams";
import { parseOpenAir } from "@/lib/vfr/airspace";
import {
  analyzeRouteAirspaces,
  generateApproachBriefing,
  generateDepartureBriefing,
  generateRouteSummary,
  minimumCruiseAltitude,
  type BriefingForm,
  type BriefingWeather,
  type FlightPlanSnapshot,
  type NotamVerification,
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
  }>;
};

type RunwayOption = {
  id: string;
  heading: number;
};

type AirportDbRecord = {
  runways?: Array<{
    closed?: string;
    le_ident?: string;
    le_heading_degT?: string;
    he_ident?: string;
    he_heading_degT?: string;
  }>;
};

const DEFAULT_FORM: BriefingForm = {
  aircraftStatus: "normal",
  fuelOnBoard: "",
  notamStatus: "not-verified",
  notamSummary: "",
  expectedWeather: "",
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
  rawTaf?: string | null,
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
    rawTaf: rawTaf ?? null,
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
  if (!response.ok) {
    throw new Error("METAR HTTP " + response.status);
  }
  const payload = (await response.json()) as MetarProxyResponse;

  let rawTaf: string | null = null;
  try {
    const stationsResponse = await fetch("/api/weather/stations");
    if (stationsResponse.ok) {
      const stationsPayload =
        (await stationsResponse.json()) as WeatherStationsResponse;
      rawTaf =
        stationsPayload.stations?.find(
          (station) => station.icao === payload.station,
        )?.rawTaf ?? null;
    }
  } catch {
    rawTaf = null;
  }

  return parseWeather(icao, payload, rawTaf);
}

function parseHeading(value: string | undefined, ident: string | undefined) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return ((numeric % 360) + 360) % 360;
  const match = ident?.match(/^(\d{2})/);
  if (!match) return null;
  const heading = Number(match[1]) * 10;
  return heading === 360 ? 0 : heading;
}

async function fetchRunways(icao: string) {
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
        if (low && lowHeading != null) runways.push({ id: low, heading: lowHeading });
        if (high && highHeading != null) runways.push({ id: high, heading: highHeading });
      }
      return runways;
    } catch {
      // Try the next public runway database.
    }
  }
  return [] as RunwayOption[];
}

function angleDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function windRunwaySuggestion(
  runways: RunwayOption[],
  weather: BriefingWeather | null,
) {
  if (
    !runways.length ||
    weather?.windDirection == null ||
    weather.windDirection === "VRB"
  ) {
    return null;
  }
  return [...runways].sort(
    (a, b) =>
      angleDifference(a.heading, weather.windDirection as number) -
      angleDifference(b.heading, weather.windDirection as number),
  )[0] ?? null;
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

function copyText(text: string) {
  return navigator.clipboard.writeText(text);
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

export function BriefingPanel({ plan }: Props) {
  const [form, setForm] = useState<BriefingForm>(DEFAULT_FORM);
  const [notamText, setNotamText] = useState("");
  const [departureWeather, setDepartureWeather] =
    useState<BriefingWeather | null>(null);
  const [destinationWeather, setDestinationWeather] =
    useState<BriefingWeather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [airspaceText, setAirspaceText] = useState("");
  const [airspaceError, setAirspaceError] = useState("");
  const [departureRunways, setDepartureRunways] = useState<RunwayOption[]>([]);
  const [destinationRunways, setDestinationRunways] = useState<RunwayOption[]>([]);
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
      const jobs: Array<Promise<BriefingWeather | null>> = [
        departureIcao
          ? fetchWeather(departureIcao, departure.lat, departure.lon)
          : Promise.resolve(null),
        destinationIcao
          ? fetchWeather(destinationIcao, destination.lat, destination.lon)
          : Promise.resolve(null),
      ];
      const [dep, dest] = await Promise.all(jobs);
      setDepartureWeather(dep);
      setDestinationWeather(dest);
      if (!dep && !dest) {
        setWeatherError(
          "Departure and destination must be ICAO-coded airports for automatic weather lookup.",
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

  useEffect(() => {
    void refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureIcao, destinationIcao, departure?.lat, departure?.lon, destination?.lat, destination?.lon]);

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
      setDepartureRunways([]);
      return;
    }
    void fetchRunways(departureIcao).then((items) => {
      if (!cancelled) setDepartureRunways(items);
    });
    return () => {
      cancelled = true;
    };
  }, [departureIcao]);

  useEffect(() => {
    let cancelled = false;
    if (!destinationIcao) {
      setDestinationRunways([]);
      return;
    }
    void fetchRunways(destinationIcao).then((items) => {
      if (!cancelled) setDestinationRunways(items);
    });
    return () => {
      cancelled = true;
    };
  }, [destinationIcao]);

  const parsedNotams = useMemo(
    () => parseNotamBriefing(notamText),
    [notamText],
  );
  const cruiseAltitude = Number(form.cruiseAltitudeFt);
  const airspaces = useMemo(() => {
    if (!plan || !airspaceText) return [];
    return analyzeRouteAirspaces(
      plan.waypoints,
      parseOpenAir(airspaceText),
      5,
      Number.isFinite(cruiseAltitude) && cruiseAltitude > 0
        ? cruiseAltitude
        : null,
    );
  }, [plan, airspaceText, cruiseAltitude]);

  const departureSuggestion = useMemo(
    () => windRunwaySuggestion(departureRunways, departureWeather),
    [departureRunways, departureWeather],
  );
  const destinationSuggestion = useMemo(
    () => windRunwaySuggestion(destinationRunways, destinationWeather),
    [destinationRunways, destinationWeather],
  );

  const departureBriefing = useMemo(
    () =>
      generateDepartureBriefing({
        plan,
        form,
        weather: departureWeather,
      }),
    [plan, form, departureWeather],
  );
  const routeBriefing = useMemo(
    () =>
      generateRouteSummary({
        plan,
        form,
        departureWeather,
        destinationWeather,
        airspaces,
        airspaceDataLoaded: Boolean(airspaceText),
      }),
    [plan, form, departureWeather, destinationWeather, airspaces, airspaceText],
  );
  const approachBriefing = useMemo(
    () =>
      generateApproachBriefing({
        plan,
        form,
        weather: destinationWeather,
      }),
    [plan, form, destinationWeather],
  );

  const briefingText =
    activeTab === "departure"
      ? departureBriefing
      : activeTab === "route"
        ? routeBriefing
        : approachBriefing;

  const minCruise = minimumCruiseAltitude(form.highestObstacleFt);
  const operationalComplete = Boolean(
    form.departureRunway &&
      form.circuitExit &&
      form.initialAltitudeFt &&
      form.cruiseAltitudeFt &&
      form.com1Active &&
      form.taxiRoute &&
      form.rotationSpeedKt &&
      form.climbSpeedKt,
  );

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
                Calculate a route in Planner first. The briefing is generated from
                the current calculated flight plan.
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
                <FileText className="size-4" />
                Advanced CPL VFR briefing
              </CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                {plan.waypoints.map((waypoint) => waypoint.label).join(" → ")}
              </p>
            </div>
            <Badge variant="outline">ANWB / training format</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {statusBadge(plan.waypoints.length >= 2, "Route")}
            {statusBadge(Boolean(departureIcao), "Departure airport")}
            {statusBadge(Boolean(destinationIcao), "Destination airport")}
            {statusBadge(Boolean(departureWeather), "Departure weather")}
            {statusBadge(Boolean(destinationWeather), "Destination weather")}
            {statusBadge(
              Boolean(
                form.llsigwxSummary &&
                  form.routeWindTemp &&
                  form.freezingLevelFt &&
                  form.goNoGo !== "not-set",
              ),
              "Advanced met",
            )}
            {statusBadge(Boolean(airspaceText), "Airspace dataset", airspaceError)}
            {statusBadge(form.notamStatus !== "not-verified", "NOTAM verified")}
            {statusBadge(operationalComplete, "Operational data")}
          </div>

          <Alert>
            <ShieldAlert className="size-4" />
            <AlertDescription>
              Training and planning aid only. OpenAIR data in this project is
              unofficial. Verify current AIP, NOTAMs, meteorology, aerodrome data,
              aircraft POH/AFM and instructor/company procedures before flight.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">ANWB input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Departure ICAO override"
                  value={form.departureIcao}
                  onChange={(value) => update("departureIcao", value.toUpperCase())}
                  placeholder={departure?.label ?? "e.g. LHBC"}
                />
                <Field
                  label="Destination ICAO override"
                  value={form.destinationIcao}
                  onChange={(value) => update("destinationIcao", value.toUpperCase())}
                  placeholder={destination?.label ?? "e.g. LHPP"}
                />
                <Field
                  label="Aircraft technical status"
                  value={form.aircraftStatus}
                  onChange={(value) => update("aircraftStatus", value)}
                />
                <Field
                  label="Fuel on board"
                  value={form.fuelOnBoard}
                  onChange={(value) => update("fuelOnBoard", value)}
                  placeholder="e.g. 28 US gal"
                />
              </div>

              <div className="space-y-2">
                <Label className="field-label">NOTAM verification</Label>
                <Select
                  value={form.notamStatus}
                  onValueChange={(value) =>
                    update("notamStatus", value as NotamVerification)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not-verified">Not verified</SelectItem>
                    <SelectItem value="checked-none">
                      Checked — nothing relevant
                    </SelectItem>
                    <SelectItem value="checked-relevant">
                      Checked — relevant NOTAMs
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="field-label">Paste NOTAM briefing</Label>
                <Textarea
                  className="min-h-[100px] font-mono text-xs"
                  value={notamText}
                  onChange={(event) => setNotamText(event.target.value)}
                  placeholder="Paste official briefing text here for reference."
                />
                <p className="text-xs text-muted-foreground">
                  {parsedNotams.length
                    ? parsedNotams.length + " NOTAM block(s) parsed. Verification status remains manual."
                    : "The app never assumes that NOTAMs are clear unless you mark them checked."}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="field-label">Relevant NOTAM summary</Label>
                <Textarea
                  className="min-h-[70px]"
                  value={form.notamSummary}
                  onChange={(event) => update("notamSummary", event.target.value)}
                  placeholder="Only operationally relevant items for the procedure."
                />
              </div>

              <div className="space-y-2">
                <Label className="field-label">
                  Expected weather at procedure time
                </Label>
                <Textarea
                  className="min-h-[70px]"
                  value={form.expectedWeather}
                  onChange={(event) => update("expectedWeather", event.target.value)}
                  placeholder="Summarise TAF / LLSIGWX / forecast relevant to departure."
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Cruise wind / temperature"
                  value={form.routeWindTemp}
                  onChange={(value) => update("routeWindTemp", value)}
                  placeholder="e.g. 240/18 kt, +12°C at 4500 ft"
                />
                <Field
                  label="0°C level (ft)"
                  type="number"
                  value={form.freezingLevelFt}
                  onChange={(value) => update("freezingLevelFt", value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="field-label">LLSIGWX big-picture analysis</Label>
                <Textarea
                  className="min-h-[70px]"
                  value={form.llsigwxSummary}
                  onChange={(event) => update("llsigwxSummary", event.target.value)}
                  placeholder="Relevant fronts, precipitation, turbulence, visibility or cloud trends."
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
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
                  label="GO / NO-GO reasoning"
                  value={form.goNoGoReason}
                  onChange={(value) => update("goNoGoReason", value)}
                  placeholder="Commercial-style operational reasoning."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={refreshWeather}
                  disabled={weatherLoading}
                >
                  <RefreshCw
                    className={"size-4 " + (weatherLoading ? "animate-spin" : "")}
                  />
                  Refresh weather
                </Button>
                {departureWeather && (
                  <Badge variant="outline">
                    <CloudSun className="mr-1 size-3" />
                    DEP METAR {departureWeather.station}
                  </Badge>
                )}
                {destinationWeather && (
                  <Badge variant="outline">
                    <CloudSun className="mr-1 size-3" />
                    DEST METAR {destinationWeather.station}
                  </Badge>
                )}
              </div>

              {(departureWeather?.rawMetar || destinationWeather?.rawMetar) && (
                <details className="rounded-md border border-border bg-panel-muted p-3 text-xs">
                  <summary className="cursor-pointer font-mono font-semibold uppercase tracking-[0.12em]">
                    Raw METAR / TAF reference
                  </summary>
                  <div className="mt-3 space-y-3 font-mono text-[11px] leading-relaxed">
                    {departureWeather && (
                      <div>
                        <strong>DEP {departureWeather.station}</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {departureWeather.rawMetar || "No METAR"}
                        </pre>
                        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {departureWeather.rawTaf ||
                            "No TAF available for this reporting station"}
                        </pre>
                      </div>
                    )}
                    {destinationWeather && (
                      <div>
                        <strong>DEST {destinationWeather.station}</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {destinationWeather.rawMetar || "No METAR"}
                        </pre>
                        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {destinationWeather.rawTaf ||
                            "No TAF available for this reporting station"}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
              {weatherError && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>{weatherError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">Departure operational data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              {departureSuggestion && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel-muted p-3 text-xs">
                  <MapPin className="size-4 text-primary" />
                  Wind-only runway suggestion: RWY {departureSuggestion.id}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => update("departureRunway", departureSuggestion.id)}
                  >
                    Apply
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Departure runway" value={form.departureRunway} onChange={(value) => update("departureRunway", value)} />
                <Field label="Chart number" value={form.chartNumber} onChange={(value) => update("chartNumber", value)} />
                <Field label="Circuit exit leg" value={form.circuitExit} onChange={(value) => update("circuitExit", value)} placeholder="e.g. crosswind leg" />
                <Field label="Initial altitude (ft)" type="number" value={form.initialAltitudeFt} onChange={(value) => update("initialAltitudeFt", value)} />
                <Field label="Cruise altitude (ft)" type="number" value={form.cruiseAltitudeFt} onChange={(value) => update("cruiseAltitudeFt", value)} />
                <Field label="Highest obstacle ±5 NM (ft)" type="number" value={form.highestObstacleFt} onChange={(value) => update("highestObstacleFt", value)} />
                <Field label="COM1 active" value={form.com1Active} onChange={(value) => update("com1Active", value)} />
                <Field label="COM1 standby" value={form.com1Standby} onChange={(value) => update("com1Standby", value)} />
                <Field label="COM2 active" value={form.com2Active} onChange={(value) => update("com2Active", value)} />
                <Field label="COM2 standby" value={form.com2Standby} onChange={(value) => update("com2Standby", value)} />
                <Field label="Squawk" value={form.squawk} onChange={(value) => update("squawk", value)} />
                <Field
                  label="QNH to set / cross-check"
                  value={form.qnh}
                  onChange={(value) => update("qnh", value)}
                  placeholder="Use local/cleared QNH"
                />
                <Field label="Expected taxi routing" value={form.taxiRoute} onChange={(value) => update("taxiRoute", value)} />
                <Field label="Rotation speed Vr (kt)" type="number" value={form.rotationSpeedKt} onChange={(value) => update("rotationSpeedKt", value)} />
                <Field label="Climb speed (kt)" type="number" value={form.climbSpeedKt} onChange={(value) => update("climbSpeedKt", value)} />
              </div>

              {minCruise != null && (
                <Alert>
                  <AlertDescription>
                    Obstacle-based minimum: {minCruise} ft before airspace and
                    semicircular-level constraints.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">Route and approach data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="space-y-2">
                <Label className="field-label">Threat and error management</Label>
                <Textarea
                  value={form.routeThreats}
                  onChange={(event) => update("routeThreats", event.target.value)}
                  placeholder="Terrain, weather, traffic, airspace, navigation threats."
                />
              </div>
              {destinationSuggestion && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel-muted p-3 text-xs">
                  <MapPin className="size-4 text-primary" />
                  Destination wind-only runway suggestion: RWY {destinationSuggestion.id}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => update("destinationRunway", destinationSuggestion.id)}
                  >
                    Apply
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Destination chart number" value={form.destinationChartNumber} onChange={(value) => update("destinationChartNumber", value)} />
                <Field label="Destination COM frequencies" value={form.destinationCom} onChange={(value) => update("destinationCom", value)} />
                <Field label="Destination runway" value={form.destinationRunway} onChange={(value) => update("destinationRunway", value)} />
                <Field label="Circuit join" value={form.destinationCircuitJoin} onChange={(value) => update("destinationCircuitJoin", value)} />
                <Field label="Circuit / target altitude (ft)" type="number" value={form.destinationCircuitAltitudeFt} onChange={(value) => update("destinationCircuitAltitudeFt", value)} />
                <Field label="Taxi after landing" value={form.destinationTaxiRoute} onChange={(value) => update("destinationTaxiRoute", value)} />
                <Field label="Minimum diversion fuel" value={form.diversionFuel} onChange={(value) => update("diversionFuel", value)} />
                <Field label="Diversion extra time" value={form.diversionExtraTime} onChange={(value) => update("diversionExtraTime", value)} placeholder="e.g. 35 minutes" />
              </div>
            </CardContent>
          </Card>
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
                    onClick={() => void copyText(briefingText)}
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

          <Card>
            <CardHeader className="border-b border-border bg-panel-muted px-4 py-3">
              <CardTitle className="panel-heading">Detected airspaces ±5 NM</CardTitle>
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
        </div>
      </div>
    </section>
  );
}

export default BriefingPanel;
