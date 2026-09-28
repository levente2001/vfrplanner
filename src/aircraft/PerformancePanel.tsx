import { useState } from "react";
import type { User } from "firebase/auth";
import type { BriefingWeather } from "@/lib/vfr/briefing";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import { AircraftField, AircraftSelect } from "./fields";
import { aircraftError } from "./repository";
import { useAircraft } from "./useAircraft";
import {
  calculatePerformance,
  distanceMargin,
  pressureAltitude,
} from "./performance";
import type { Aircraft } from "./types";

export type PerformanceAirport = {
  icao: string;
  elevationFt: number | null;
  runways: {
    id: string;
    heading: number;
    lengthFt?: number | null;
    surface?: string;
  }[];
  suggestedRunway: string;
  weather: BriefingWeather | null;
  wind: {
    direction: number | "VRB" | null;
    speedKt: number | null;
    source?: string;
  };
};

export function PerformancePanel({
  user,
  departure,
  arrival,
}: {
  user: User | null;
  departure: PerformanceAirport;
  arrival: PerformanceAirport;
}) {
  const query = useAircraft(user?.uid);
  const [selection, setSelection] = useState<{
    uid: string;
    id: string;
  } | null>(null);
  const selectedId = selection?.uid === user?.uid ? (selection?.id ?? "") : "";
  const aircraft = query.data?.find((item) => item.id === selectedId);
  return (
    <Card>
      <CardHeader className="border-b border-border bg-panel-muted">
        <CardTitle className="panel-heading">Aircraft performance</CardTitle>
        <p className="mt-2 text-xs text-muted-foreground">
          POH required distances compared with runway declared distances. TORA /
          TODA / ASDA / LDA are published aerodrome values, not aircraft
          performance calculations.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {!user ? (
          <p className="text-sm">
            Sign in and add an aircraft in{" "}
            <a className="text-primary underline" href="#my-aircraft">
              My aircraft
            </a>{" "}
            to calculate performance.
          </p>
        ) : (
          <>
            {query.isPending && <p className="text-sm">Loading aircraft…</p>}
            {query.error && (
              <p role="alert" className="text-sm text-destructive">
                {aircraftError(query.error)}
              </p>
            )}
            <div className="max-w-lg">
              <AircraftSelect
                label="Aircraft / POH"
                value={selectedId}
                onChange={(id) => setSelection({ uid: user.uid, id })}
              >
                <option value="">Select aircraft</option>
                {query.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.registration} · {item.type}
                  </option>
                ))}
              </AircraftSelect>
            </div>
            {!query.isPending && !query.error && !query.data?.length && (
              <p className="text-sm text-muted-foreground">
                Add a registration, aircraft type, POH and performance profiles
                in{" "}
                <a href="#my-aircraft" className="text-primary underline">
                  My aircraft
                </a>
                .
              </p>
            )}
            {aircraft && (
              <div className="grid items-start gap-4 2xl:grid-cols-2">
                <AirportPerformance
                  key={`${user.uid}-${aircraft.id}-dep-${departure.icao}-${departure.suggestedRunway}`}
                  aircraft={aircraft}
                  airport={departure}
                  phase="takeoff"
                />
                <AirportPerformance
                  key={`${user.uid}-${aircraft.id}-arr-${arrival.icao}-${arrival.suggestedRunway}`}
                  aircraft={aircraft}
                  airport={arrival}
                  phase="landing"
                />
              </div>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Use the applicable aircraft POH revision and current AIP / NOTAM
          declared distances. Results compare distances only; they do not assess
          obstacle clearance, climb performance or all operating limitations.
        </p>
      </CardContent>
    </Card>
  );
}

function numeric(text: string): number | null {
  if (!text.trim()) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function AirportPerformance({
  aircraft,
  airport,
  phase,
}: {
  aircraft: Aircraft;
  airport: PerformanceAirport;
  phase: "takeoff" | "landing";
}) {
  const [runwayId, setRunwayId] = useState(airport.suggestedRunway);
  const [manualRunway, setManualRunway] = useState("");
  const [profileId, setProfileId] = useState("");
  const runway = airport.runways.find((item) => item.id === runwayId);
  const profiles = aircraft.profiles.filter(
    (profile) => profile.phase === phase,
  );
  const profile = profiles.find((item) => item.id === profileId);
  return (
    <div className="min-w-0 space-y-4 rounded-md border border-border p-4">
      <h3 className="font-semibold">
        {phase === "takeoff" ? "Departure / takeoff" : "Arrival / landing"} ·{" "}
        {airport.icao || "Airport not selected"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <AircraftSelect
          label="Runway direction"
          value={runwayId}
          onChange={setRunwayId}
        >
          <option value="">Manual runway</option>
          {airport.runways.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {item.surface ?? "surface unknown"}
              {item.lengthFt
                ? ` · ${Math.round(item.lengthFt * 0.3048)} m physical length`
                : ""}
            </option>
          ))}
        </AircraftSelect>
        <AircraftSelect
          label="Verified POH profile"
          value={profileId}
          onChange={setProfileId}
        >
          <option value="">Select performance profile</option>
          {profiles.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.verified}>
              {item.name}
              {!item.verified ? " (unverified)" : ""}
            </option>
          ))}
        </AircraftSelect>
        {!runway && (
          <AircraftField
            label="Runway designator"
            value={manualRunway}
            onChange={setManualRunway}
            placeholder="e.g. 23"
          />
        )}
      </div>
      {!profiles.length && (
        <p className="text-xs text-muted-foreground">
          No {phase} profile. Add verified data from this aircraft’s POH in My
          aircraft.
        </p>
      )}
      {profile && (
        <PerformanceCalculation
          key={`${runwayId || manualRunway}-${profile.id}-${JSON.stringify(profile)}`}
          aircraft={aircraft}
          airport={airport}
          runway={runway}
          runwayId={runway?.id || manualRunway}
          profile={profile}
        />
      )}
    </div>
  );
}

function PerformanceCalculation({
  aircraft,
  airport,
  runway,
  runwayId,
  profile,
}: {
  aircraft: Aircraft;
  airport: PerformanceAirport;
  runway: PerformanceAirport["runways"][number] | undefined;
  runwayId: string;
  profile: Aircraft["profiles"][number];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [declaredConfirmedKey, setDeclaredConfirmedKey] = useState<
    string | null
  >(null);
  const set = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const exactWeather =
    airport.weather?.requestedIcao === airport.icao &&
    airport.weather?.station === airport.icao
      ? airport.weather
      : null;
  const fallback = (key: string, value: number | null | undefined) =>
    values[key] ?? (value == null ? "" : String(value));
  const elevation = fallback("elevation", airport.elevationFt);
  const qnh = fallback("qnh", exactWeather?.qnhHpa);
  const temperature = fallback("temperature", exactWeather?.temperatureC);
  const heading = fallback("heading", runway?.heading);
  const windDirection = fallback(
    "windDirection",
    exactWeather && typeof airport.wind.direction === "number"
      ? airport.wind.direction
      : null,
  );
  const windSpeed = fallback(
    "windSpeed",
    exactWeather ? airport.wind.speedKt : null,
  );
  const hdg = numeric(heading),
    direction = numeric(windDirection),
    speed = numeric(windSpeed);
  const componentsValid =
    hdg !== null &&
    hdg >= 0 &&
    hdg <= 360 &&
    speed !== null &&
    speed >= 0 &&
    (speed === 0 || (direction !== null && direction >= 0 && direction <= 360));
  const headwind = componentsValid
    ? speed === 0
      ? 0
      : speed * Math.cos(((direction! - hdg) * Math.PI) / 180)
    : null;
  const crosswind = componentsValid
    ? speed === 0
      ? 0
      : Math.abs(speed * Math.sin(((direction! - hdg) * Math.PI) / 180))
    : null;
  const elev = numeric(elevation),
    pressure = numeric(qnh);
  const estimatedAltitude =
    elev !== null && pressure !== null && pressure > 0
      ? Math.round(pressureAltitude(elev, pressure))
      : null;
  const altitude = fallback("altitude", estimatedAltitude);
  const component = fallback(
    "headwind",
    headwind === null ? null : Math.round(headwind * 10) / 10,
  );
  const weight = numeric(values.weight ?? "");
  const temp = numeric(temperature),
    pa = numeric(altitude),
    hw = numeric(component),
    slope = numeric(values.slope ?? "");
  const factor = numeric(values.factor ?? "1");
  const conditionsKey = JSON.stringify({
    values,
    elevation,
    qnh,
    temperature,
    heading,
    windDirection,
    windSpeed,
    altitude,
    component,
    profile,
    runwayId,
    icao: airport.icao,
    observedAt: exactWeather?.observedAt,
    windSource: airport.wind.source,
  });
  const confirmed = confirmedKey === conditionsKey;
  const declaredKey = JSON.stringify({
    icao: airport.icao,
    runwayId,
    tora: values.tora,
    toda: values.toda,
    asda: values.asda,
    lda: values.lda,
    source: values.source,
  });
  const declaredConfirmed = declaredConfirmedKey === declaredKey;
  let error = "";
  let result: ReturnType<typeof calculatePerformance> | null = null;
  if (
    !aircraft.documents.some((document) => document.id === profile.documentId)
  )
    error = "The source POH document is missing.";
  else if (!airport.icao || !runwayId.trim())
    error = "Select the airport and runway direction.";
  else if (
    [weight, temp, pa, hw, slope, factor].some((value) => value === null)
  )
    error =
      "Enter weight, temperature, pressure altitude, headwind component, slope and planning factor.";
  else if (factor! < 1) error = "The planning factor must be at least 1.00.";
  else if (
    values.surface !== profile.surface ||
    values.condition !== profile.condition
  )
    error = "Select a surface and runway condition matching this POH profile.";
  else if (!confirmed)
    error = "Confirm the aircraft configuration and calculation inputs below.";
  else {
    try {
      result = calculatePerformance(profile, {
        weightKg: weight!,
        temperatureC: temp!,
        pressureAltitudeFt: pa!,
        headwindKt: hw!,
        slopePercent: slope!,
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Calculation failed.";
    }
  }
  const required = (value: number | null | undefined) =>
    value == null ? null : Math.ceil(value * (factor ?? 1));
  const comparisons =
    profile.phase === "takeoff"
      ? [
          {
            name: "TORA",
            label: "Ground roll",
            required: required(result?.groundRollM),
            key: "tora",
          },
          {
            name: "TODA",
            label: `Takeoff over ${profile.obstacleHeightFt} ft`,
            required: required(result?.distanceM),
            key: "toda",
          },
          {
            name: "ASDA",
            label: "Accelerate-stop",
            required: required(result?.accelerateStopM),
            key: "asda",
          },
        ]
      : [
          {
            name: "LDA",
            label: `Landing from ${profile.obstacleHeightFt} ft`,
            required: required(result?.distanceM),
            key: "lda",
          },
        ];
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-panel-muted p-3 text-xs">
        <p className="font-semibold">{profile.configuration}</p>
        <p className="mt-1">
          {profile.surface} / {profile.condition} · obstacle{" "}
          {profile.obstacleHeightFt} ft ·{" "}
          {profile.interpolation === "linear"
            ? "POH linear interpolation"
            : "Exact POH rows"}
        </p>
        <p className="mt-1 text-muted-foreground">
          Source:{" "}
          {
            aircraft.documents.find(
              (document) => document.id === profile.documentId,
            )?.name
          }{" "}
          · {profile.source}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AircraftField
          label={
            profile.phase === "takeoff"
              ? "Takeoff mass (kg)"
              : "Landing mass (kg)"
          }
          type="number"
          value={values.weight ?? ""}
          onChange={(v) => set("weight", v)}
        />
        <AircraftField
          label="Elevation (ft)"
          type="number"
          value={elevation}
          onChange={(v) => set("elevation", v)}
        />
        <AircraftField
          label="QNH (hPa)"
          type="number"
          value={qnh}
          onChange={(v) => set("qnh", v)}
        />
        <AircraftField
          label="Temperature (°C)"
          type="number"
          value={temperature}
          onChange={(v) => set("temperature", v)}
        />
        <AircraftField
          label="Pressure altitude (ft)"
          type="number"
          value={altitude}
          onChange={(v) => set("altitude", v)}
        />
        <AircraftField
          label="Runway heading (° true)"
          type="number"
          value={heading}
          onChange={(v) => set("heading", v)}
        />
        <AircraftField
          label="Wind from (° true)"
          type="number"
          value={windDirection}
          onChange={(v) => set("windDirection", v)}
        />
        <AircraftField
          label="Wind speed (kt)"
          type="number"
          value={windSpeed}
          onChange={(v) => set("windSpeed", v)}
        />
        <AircraftField
          label="Headwind + / tailwind − (kt)"
          type="number"
          value={component}
          onChange={(v) => set("headwind", v)}
        />
        <AircraftField
          label="Slope uphill + / downhill − (%)"
          type="number"
          value={values.slope ?? ""}
          onChange={(v) => set("slope", v)}
        />
        <AircraftField
          label="Additional planning factor"
          type="number"
          value={values.factor ?? "1"}
          onChange={(v) => set("factor", v)}
        />
        <AircraftSelect
          label="Actual surface"
          value={values.surface ?? ""}
          onChange={(v) => set("surface", v)}
        >
          <option value="">Select</option>
          <option value="paved">Paved</option>
          <option value="grass">Grass</option>
          <option value="other">Other</option>
        </AircraftSelect>
        <AircraftSelect
          label="Actual runway condition"
          value={values.condition ?? ""}
          onChange={(v) => set("condition", v)}
        >
          <option value="">Select</option>
          <option value="dry">Dry</option>
          <option value="wet">Wet</option>
          <option value="other">Other</option>
        </AircraftSelect>
      </div>
      <p className="text-xs text-muted-foreground">
        Pressure altitude is estimated from elevation and QNH unless overridden.
        Positive wind component means headwind.{" "}
        {crosswind !== null
          ? `Crosswind: ${crosswind.toFixed(1)} kt.`
          : "Wind component needs confirmed data when wind is variable or unavailable."}{" "}
        No generic wind, grass, wet-runway or weight correction is applied
        beyond the entered POH data. Factor 1.00 adds no margin.
      </p>
      {exactWeather && (
        <p className="break-words font-mono text-[11px] text-muted-foreground">
          Weather input: {exactWeather.station} ·{" "}
          {exactWeather.observedAt || "time unavailable"} ·{" "}
          {exactWeather.rawMetar}
          {` · Wind input source: ${airport.wind.source ?? "METAR"}; verify forecast and gust effects for the planned time.`}
          {typeof airport.wind.direction !== "number" &&
          airport.wind.direction === "VRB"
            ? " · Variable wind: enter an applicable component."
            : ""}
        </p>
      )}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) =>
            setConfirmedKey(event.target.checked ? conditionsKey : null)
          }
        />
        I checked these inputs for the planned operation, including weather
        validity, configuration, technique, surface, runway condition and
        applicable POH limitations.
      </label>
      {error && (
        <p
          role="status"
          className="rounded-md border border-border p-3 text-sm"
        >
          {error}
        </p>
      )}
      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-semibold">
          Published runway distances · {airport.icao} RWY {runwayId || "—"}
        </h4>
        <p className="text-xs text-muted-foreground">
          Enter the applicable AIP / NOTAM declared distances, including
          intersection or temporary reductions. The runway database’s physical
          length is not substituted for these values.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["tora", "toda", "asda", "lda"].map((key) => (
            <AircraftField
              key={key}
              label={`${key.toUpperCase()} (m)`}
              type="number"
              value={values[key] ?? ""}
              onChange={(v) => set(key, v)}
            />
          ))}
        </div>
        <AircraftField
          label="AIP / NOTAM reference and effective date"
          value={values.source ?? ""}
          onChange={(v) => set("source", v)}
          placeholder="Publication, page / NOTAM number, effective date"
        />
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={declaredConfirmed}
            onChange={(event) =>
              setDeclaredConfirmedKey(event.target.checked ? declaredKey : null)
            }
          />
          I verified these declared distances for this runway direction and
          planned operation.
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Check</TableHead>
            <TableHead>Required</TableHead>
            <TableHead>Available</TableHead>
            <TableHead>Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisons.map((comparison) => {
            const available = numeric(values[comparison.key] ?? "");
            const published =
              declaredConfirmed &&
              Boolean(values.source?.trim()) &&
              available !== null &&
              available > 0;
            const margin = distanceMargin(
              comparison.required,
              published ? available : null,
            );
            return (
              <TableRow key={comparison.key}>
                <TableCell>
                  {comparison.label}
                  <span className="block text-muted-foreground">
                    vs {comparison.name}
                  </span>
                </TableCell>
                <TableCell>
                  {comparison.required === null
                    ? comparison.key === "asda" && result
                      ? "Not supplied by POH"
                      : "Not calculated"
                    : `${comparison.required} m`}
                </TableCell>
                <TableCell>
                  {published ? `${available} m` : "Unverified / missing"}
                </TableCell>
                <TableCell
                  className={
                    margin && !margin.sufficient
                      ? "font-semibold text-destructive"
                      : ""
                  }
                >
                  {margin
                    ? `${Math.floor(margin.remainingM)} m · ${margin.sufficient ? "distance fits" : "insufficient distance"}`
                    : "Not assessed"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {result && (
        <p className="text-xs text-muted-foreground">
          POH {result.interpolated ? "interpolated" : "tabulated"} result before
          additional factor: ground roll {Math.ceil(result.groundRollM)} m,
          total distance {Math.ceil(result.distanceM)} m
          {result.accelerateStopM === null
            ? ""
            : `, accelerate-stop ${Math.ceil(result.accelerateStopM)} m`}
          . Comparison includes factor ×{factor} and rounds required distance
          up.
        </p>
      )}
    </div>
  );
}
