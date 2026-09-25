import type { Airspace } from "./airspace";
import type { Leg, WaypointMeta } from "./nav";

export type BriefingFuelUnit = "L" | "USG";

export type FlightPlanSnapshot = {
  name: string;
  waypoints: WaypointMeta[];
  legs: Leg[];
  totalDistanceNm: number;
  totalTimeHours: number;
  totalTripFuel: number;
  tas: number;
  fuelFlow: number;
  fuelUnit: BriefingFuelUnit;
  windDirection: number;
  windSpeed: number;
  variationValue: number;
  variationDirection: "E" | "W";
};

export type BriefingWeather = {
  requestedIcao: string;
  station: string;
  distanceNm: number | null;
  rawMetar: string;
  rawTaf?: string | null;
  tafSegments?: Array<{
    type: string;
    from: string | null;
    to: string | null;
    wind: {
      direction: number | "VRB" | null;
      speedKt: number | null;
      gustKt: number | null;
    };
    visibilitySm: number | null;
    visibilityText: string;
    weather: string | null;
    clouds: Array<{ cover: string; baseFt: number | null }>;
  }>;
  windDirection: number | "VRB" | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilityKm: number | null;
  ceilingFt: number | null;
  cloudText: string;
  temperatureC: number | null;
  dewpointC: number | null;
  qnhHpa: number | null;
  observedAt?: string | null;
};

export type AirspaceBriefingItem = {
  name: string;
  type: string;
  classCode: string;
  lowerLimit: string;
  upperLimit: string;
  distanceNm: number;
  firstLegIndex: number;
  verticalStatus: "inside" | "outside" | "unknown";
};

export type NotamVerification =
  | "not-verified"
  | "checked-none"
  | "checked-relevant"
  | "auto-partial-none"
  | "auto-partial-relevant";

export type BriefingForm = {
  aircraftStatus: string;
  fuelOnBoard: string;
  notamStatus: NotamVerification;
  notamSummary: string;
  expectedWeather: string;
  destinationExpectedWeather: string;
  departureIcao: string;
  destinationIcao: string;
  llsigwxSummary: string;
  routeWindTemp: string;
  freezingLevelFt: string;
  goNoGo: "not-set" | "go" | "no-go";
  goNoGoReason: string;
  departureRunway: string;
  chartNumber: string;
  circuitExit: string;
  initialAltitudeFt: string;
  cruiseAltitudeFt: string;
  com1Active: string;
  com1Standby: string;
  com2Active: string;
  com2Standby: string;
  squawk: string;
  qnh: string;
  taxiRoute: string;
  rotationSpeedKt: string;
  climbSpeedKt: string;
  runwayCondition: "not-set" | "dry" | "wet" | "other";
  runwayConditionOther: string;
  highestObstacleFt: string;
  routeThreats: string;
  destinationChartNumber: string;
  destinationCom: string;
  destinationRunway: string;
  destinationCircuitJoin: string;
  destinationCircuitAltitudeFt: string;
  destinationTaxiRoute: string;
  diversionFuel: string;
  diversionExtraTime: string;
};

function num(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function airportLabel(waypoint: WaypointMeta | undefined) {
  if (!waypoint) return "[airport]";
  return waypoint.name
    ? waypoint.label + " (" + waypoint.name + ")"
    : waypoint.label;
}

function routeLabel(plan: FlightPlanSnapshot | null) {
  if (!plan) return "[route]";
  return plan.waypoints.map((waypoint) => waypoint.label).join(" to ");
}

function fuelLabel(plan: FlightPlanSnapshot | null) {
  if (!plan) return "[trip fuel]";
  const unit = plan.fuelUnit === "USG" ? "US gallons" : "litres";
  return plan.totalTripFuel.toFixed(1) + " " + unit;
}

function timeLabel(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return m + " minutes";
  return h + " hour" + (h === 1 ? "" : "s") + " " + m + " minutes";
}

export function formatWeatherForSpeech(weather: BriefingWeather | null) {
  if (!weather) return "weather data is not available";
  const parts: string[] = [];
  if (weather.station !== weather.requestedIcao) {
    const distance =
      weather.distanceNm == null ? "" : " " + weather.distanceNm.toFixed(1) + " NM away";
    parts.push("nearest reporting station " + weather.station + distance);
  }
  if (weather.windDirection === "VRB") {
    parts.push(
      "wind variable " +
        (weather.windSpeedKt == null ? "" : weather.windSpeedKt + " knots"),
    );
  } else if (weather.windDirection != null && weather.windSpeedKt != null) {
    let wind =
      "wind " +
      Math.round(weather.windDirection)
        .toString()
        .padStart(3, "0") +
      " degrees " +
      Math.round(weather.windSpeedKt) +
      " knots";
    if (weather.windGustKt != null) {
      wind += " gusting " + Math.round(weather.windGustKt) + " knots";
    }
    parts.push(wind);
  }
  if (weather.visibilityKm != null) {
    parts.push(
      weather.visibilityKm >= 10
        ? "visibility 10 kilometres or more"
        : "visibility " + weather.visibilityKm.toFixed(1) + " kilometres",
    );
  }
  if (weather.cloudText) parts.push(weather.cloudText);
  if (weather.temperatureC != null) {
    parts.push("temperature " + Math.round(weather.temperatureC) + " degrees Celsius");
  }
  if (weather.dewpointC != null) {
    parts.push("dew point " + Math.round(weather.dewpointC) + " degrees Celsius");
  }
  if (weather.qnhHpa != null) {
    parts.push("QNH " + Math.round(weather.qnhHpa));
  }
  return parts.length ? parts.join(", ") : "weather data is incomplete";
}

function notamSentence(form: BriefingForm) {
  if (form.notamStatus === "checked-none") {
    return "Relevant NOTAMs: nothing relevant.";
  }
  if (form.notamStatus === "checked-relevant") {
    return (
      "Relevant NOTAMs: " +
      pad(form.notamSummary, "[brief the relevant NOTAMs]") +
      "."
    );
  }
  if (form.notamStatus === "auto-partial-relevant") {
    return (
      "Automatic aerodrome NOTAM check found: " +
      pad(form.notamSummary, "[relevant aerodrome NOTAMs]") +
      ". FIR and en-route NOTAM coverage must still be verified in the official briefing."
    );
  }
  if (form.notamStatus === "auto-partial-none") {
    return "Automatic aerodrome NOTAM check found no relevant items for the ICAO-coded route aerodromes. FIR and en-route NOTAM coverage must still be verified in the official briefing.";
  }
  return "NOTAMs have not been fully verified. Complete the official NOTAM briefing before flight.";
}

function runwayCondition(form: BriefingForm) {
  if (form.runwayCondition === "not-set") return "[runway condition]";
  return form.runwayCondition === "other"
    ? pad(form.runwayConditionOther, "[runway condition]")
    : form.runwayCondition;
}

export function minimumCruiseAltitude(highestObstacleFt: string) {
  const obstacle = num(highestObstacleFt);
  if (obstacle == null || obstacle < 0) return null;
  const margin = obstacle >= 6000 ? 2000 : 1000;
  return Math.ceil((obstacle + margin) / 100) * 100;
}

export function suggestVfrCruiseAltitude(magneticCourse: number | null | undefined) {
  if (magneticCourse == null || !Number.isFinite(magneticCourse)) return null;
  const normalized = ((magneticCourse % 360) + 360) % 360;
  return normalized < 180 ? 3500 : 4500;
}

export function inferDepartureExitLeg(
  runwayHeading: number | null | undefined,
  outboundMagneticCourse: number | null | undefined,
) {
  if (
    runwayHeading == null ||
    outboundMagneticCourse == null ||
    !Number.isFinite(runwayHeading) ||
    !Number.isFinite(outboundMagneticCourse)
  ) {
    return null;
  }
  const relative =
    ((outboundMagneticCourse - runwayHeading + 540) % 360) - 180;
  const absolute = Math.abs(relative);
  if (absolute <= 45) return "upwind leg";
  if (absolute >= 135) return "downwind leg";
  return "crosswind leg";
}

export function generateDepartureBriefing(args: {
  plan: FlightPlanSnapshot | null;
  form: BriefingForm;
  weather: BriefingWeather | null;
}) {
  const { plan, form, weather } = args;
  const departure = plan?.waypoints[0];
  const firstEnroute = plan?.waypoints[1];
  const exactWeatherQnh =
    weather?.station === weather?.requestedIcao && weather?.qnhHpa != null
      ? String(Math.round(weather.qnhHpa))
      : "";
  const qnh = pad(form.qnh, exactWeatherQnh || "[QNH]");
  const weatherSpeech = formatWeatherForSpeech(weather);
  const expectedWeather = pad(
    form.expectedWeather,
    "[state expected weather at departure time from the forecast]",
  );

  const lines = [
    "Aircraft technical status: " + pad(form.aircraftStatus, "[aircraft technical status]") + ".",
    "Fuel on board is " + pad(form.fuelOnBoard, "[fuel on board]") + ".",
    "",
    notamSentence(form),
    "",
    "Weather at departure: " + weatherSpeech + ". " + expectedWeather + ".",
    "",
    "This will be a VFR departure from " + airportLabel(departure) + ".",
    "Chart number " + pad(form.chartNumber, "[chart number]") + ". Chart effective date: not applicable for VFR.",
    "Departure runway " + pad(form.departureRunway, "[runway]") + ".",
    "After departure, follow the visual circuit and from the " +
      pad(form.circuitExit, "[circuit leg]") +
      " proceed to " +
      (firstEnroute?.label ?? "[first waypoint]") +
      ".",
    form.initialAltitudeFt.trim()
      ? "Initially climb to " +
        form.initialAltitudeFt.trim() +
        " feet, then continue to " +
        pad(form.cruiseAltitudeFt, "[cruise altitude]") +
        " feet."
      : "Continue climb to the planned cruising altitude of " +
        pad(form.cruiseAltitudeFt, "[cruise altitude]") +
        " feet.",
    "Minimum safe altitude: not applicable for the VFR departure briefing.",
    "",
    "COM 1 active " +
      pad(form.com1Active, "[COM 1 active]") +
      ", standby " +
      pad(form.com1Standby, "[COM 1 standby]") +
      ".",
    "COM 2 active " +
      pad(form.com2Active, "[COM 2 active]") +
      ", standby " +
      pad(form.com2Standby, "[COM 2 standby]") +
      ".",
    "QNH " + qnh + " set and cross-checked.",
    "Squawk " + pad(form.squawk, "[squawk]") + ".",
    "Expected taxi routing will be " + pad(form.taxiRoute, "[expected taxi routing]") + ".",
    "Rotation speed " + pad(form.rotationSpeedKt, "[Vr]") + " knots.",
    "Climb speed " + pad(form.climbSpeedKt, "[climb speed]") + " knots.",
    "",
    "In case of emergency before Vr: Call STOP and close power levers to idle and use brakes as necessary.",
    "In case of emergency after Vr with sufficient runway: Call LAND and close power lever, use flaps as necessary.",
    "In case of emergency after Vr with insufficient runway: Pitch attitude for glide speed, use flaps as necessary and land max 30 degrees left or right.",
    "In case of flyable failure join circuit.",
    "In case of real emergency Instructor has control.",
    "",
    "Runway condition is " + runwayCondition(form) + ".",
    "Any questions? Briefing completed.",
  ];

  return lines.join("\n");
}

export function generateRouteSummary(args: {
  plan: FlightPlanSnapshot | null;
  form: BriefingForm;
  departureWeather: BriefingWeather | null;
  destinationWeather: BriefingWeather | null;
  airspaces: AirspaceBriefingItem[];
  airspaceDataLoaded: boolean;
}) {
  const {
    plan,
    form,
    departureWeather,
    destinationWeather,
    airspaces,
    airspaceDataLoaded,
  } = args;
  if (!plan) {
    return "No calculated route is available. Calculate the route in Planner first.";
  }
  const minCruise = minimumCruiseAltitude(form.highestObstacleFt);
  const relevantAirspaces = airspaces.filter(
    (item) => item.verticalStatus !== "outside",
  );
  const lines = [
    "ADVANCED CPL VFR ROUTE / PRE-FLIGHT SUMMARY",
    "",
    "Planned route: " + routeLabel(plan) + ".",
    "Total distance " + plan.totalDistanceNm.toFixed(1) + " NM.",
    "Estimated en-route time " + timeLabel(plan.totalTimeHours) + ".",
    "Calculated trip fuel " + fuelLabel(plan) + ".",
    "Planning wind " +
      Math.round(plan.windDirection).toString().padStart(3, "0") +
      " degrees " +
      Math.round(plan.windSpeed) +
      " knots.",
    "Planned cruising altitude " + pad(form.cruiseAltitudeFt, "[cruise altitude]") + " feet.",
  ];

  if (minCruise != null) {
    lines.push(
      "Highest obstacle entered within the 5 NM route corridor is " +
        Math.round(Number(form.highestObstacleFt)) +
        " feet. The calculated obstacle-based minimum cruise altitude is " +
        minCruise +
        " feet before applying airspace and semicircular cruising-level constraints.",
    );
  } else {
    lines.push(
      "Highest obstacle within the 5 NM route corridor has not been entered; obstacle-based minimum cruise altitude is not verified.",
    );
  }

  lines.push("");
  if (!airspaceDataLoaded) {
    lines.push(
      "Airspace analysis is unavailable because the OpenAIR dataset did not load. Verify the route against current official airspace publications.",
    );
  } else if (relevantAirspaces.length) {
    lines.push("Airspaces within the 5 NM planning corridor:");
    for (const item of relevantAirspaces) {
      lines.push(
        "- " +
          item.name +
          " (" +
          (item.type || item.classCode || "airspace") +
          "), " +
          (item.lowerLimit || "lower limit unknown") +
          " to " +
          (item.upperLimit || "upper limit unknown") +
          ".",
      );
    }
  } else {
    lines.push(
      "No relevant airspace was detected in the loaded unofficial OpenAIR dataset for the 5 NM corridor. Verify against current official AIP and NOTAM publications.",
    );
  }

  lines.push(
    "",
    "Departure weather: " + formatWeatherForSpeech(departureWeather) + ".",
    "Destination weather: " +
      formatWeatherForSpeech(destinationWeather) +
      ". Expected at arrival: " +
      pad(
        form.destinationExpectedWeather,
        "[state expected destination weather from the forecast]",
      ) +
      ".",
    "LLSIGWX analysis: " + pad(form.llsigwxSummary, "[review and summarise LLSIGWX]") + ".",
    "Cruise wind and temperature forecast: " + pad(form.routeWindTemp, "[route wind and temperature]") + ".",
    "0 degree Celsius level: " + (form.freezingLevelFt.trim() ? form.freezingLevelFt.trim() + " feet" : "[0 degree Celsius level]") + ".",
    "GO / NO-GO decision: " + (form.goNoGo === "not-set" ? "[GO / NO-GO]" : form.goNoGo.toUpperCase()) + ". Reason: " + pad(form.goNoGoReason, "[sound operational reasoning]") + ".",
    "Route threats and error management: " +
      pad(form.routeThreats, "[terrain, weather, traffic and airspace threats]") +
      ".",
    "",
    "This summary is a training/planning aid. Verify weather, airspace, NOTAMs, aerodrome data and performance against current official sources before flight.",
  );

  return lines.join("\n");
}

export function generateApproachBriefing(args: {
  plan: FlightPlanSnapshot | null;
  form: BriefingForm;
  weather: BriefingWeather | null;
}) {
  const { plan, form, weather } = args;
  const destination = plan
    ? plan.waypoints[plan.waypoints.length - 1]
    : undefined;
  const cruise = num(form.cruiseAltitudeFt);
  const target = num(form.destinationCircuitAltitudeFt);
  const altitudeToLose =
    cruise != null && target != null && cruise > target ? cruise - target : null;
  const todNm =
    altitudeToLose == null ? null : Math.ceil(((altitudeToLose / 1000) * 3 + 1) * 10) / 10;
  const lastGs =
    plan?.legs.length
      ? plan.legs[plan.legs.length - 1]?.groundSpeed ?? plan.tas
      : plan?.tas ?? null;
  const descentRate = lastGs == null ? null : Math.round(lastGs * 5);
  const weatherSpeech = formatWeatherForSpeech(weather);

  const lines = [
    "Aircraft technical status: " + pad(form.aircraftStatus, "[aircraft technical status]") + ".",
    notamSentence(form),
    "Weather at destination: " + weatherSpeech + ".",
    "Expected weather at arrival: " +
      pad(
        form.destinationExpectedWeather,
        "[state expected destination weather from the forecast]",
      ) +
      ".",
    "",
    "This will be a visual approach at " + airportLabel(destination) + ".",
    "Chart effective date: not applicable for VFR.",
    "Chart number " + pad(form.destinationChartNumber, "[chart number]") + ".",
    "Required COM frequencies: " + pad(form.destinationCom, "[destination frequencies]") + ".",
  ];

  if (todNm != null && descentRate != null) {
    lines.push(
      "Top of descent will be approximately " +
        todNm.toFixed(1) +
        " NM before the point where " +
        pad(form.destinationCircuitAltitudeFt, "[target altitude]") +
        " feet is required. Planned descent rate is approximately " +
        descentRate +
        " feet per minute.",
    );
  } else {
    lines.push(
      "Top of descent is not calculated. Enter cruise altitude and destination circuit or target altitude.",
    );
  }

  lines.push(
    "Threat and error management: " +
      pad(form.routeThreats, "[terrain, weather and traffic threats]") +
      ".",
    "We will join the visual circuit on the " +
      pad(form.destinationCircuitJoin, "[circuit leg]") +
      ".",
    "Destination runway " + pad(form.destinationRunway, "[runway]") + ".",
    "Minimum safe altitude: not applicable for the VFR approach briefing.",
    "Expected taxi routing after landing will be " +
      pad(form.destinationTaxiRoute, "[expected taxi routing]") +
      ".",
    "Minimum diversion fuel will be " +
      pad(form.diversionFuel, "[minimum diversion fuel]") +
      " and extra time " +
      pad(form.diversionExtraTime, "[extra time]") +
      ".",
    "Briefing completed. Any questions?",
  );

  return lines.join("\n");
}

function toLocalNm(
  lat: number,
  lon: number,
  refLat: number,
): [number, number] {
  return [
    lon * 60 * Math.cos((refLat * Math.PI) / 180),
    lat * 60,
  ];
}

function pointToSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
    ),
  );
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(p[0] - x, p[1] - y);
}

function orientation(
  a: [number, number],
  b: [number, number],
  c: [number, number],
) {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

function segmentDistance(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointToSegmentDistance(a, c, d),
    pointToSegmentDistance(b, c, d),
    pointToSegmentDistance(c, a, b),
    pointToSegmentDistance(d, a, b),
  );
}

function pointInPolygon(
  point: [number, number],
  polygon: Array<[number, number]>,
) {
  let inside = false;
  const x = point[1];
  const y = point[0];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![1];
    const yi = polygon[i]![0];
    const xj = polygon[j]![1];
    const yj = polygon[j]![0];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function parseVerticalFeet(value: string, upper: boolean) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "SFC" || normalized === "GND") return 0;
  if (normalized === "UNL" || normalized === "UNLIMITED") {
    return upper ? Number.POSITIVE_INFINITY : null;
  }
  const fl = normalized.match(/FL\s*(\d{2,3})/);
  if (fl) return Number(fl[1]) * 100;
  const feet = normalized.match(/(\d{2,5})\s*(?:FT|FEET)?/);
  return feet ? Number(feet[1]) : null;
}

export function analyzeRouteAirspaces(
  waypoints: WaypointMeta[],
  airspaces: Airspace[],
  corridorNm = 5,
  cruiseAltitudeFt?: number | null,
): AirspaceBriefingItem[] {
  if (waypoints.length < 2) return [];
  const refLat =
    waypoints.reduce((sum, waypoint) => sum + waypoint.lat, 0) /
    waypoints.length;
  const routeSegments: Array<
    [[number, number], [number, number]]
  > = waypoints.slice(0, -1).map((waypoint, index) => [
    toLocalNm(waypoint.lat, waypoint.lon, refLat),
    toLocalNm(waypoints[index + 1]!.lat, waypoints[index + 1]!.lon, refLat),
  ]);

  const items: AirspaceBriefingItem[] = [];
  for (const airspace of airspaces) {
    if (airspace.points.length < 3) continue;
    let minDistance = Number.POSITIVE_INFINITY;
    let firstLegIndex = Number.POSITIVE_INFINITY;

    for (let legIndex = 0; legIndex < routeSegments.length; legIndex++) {
      const [routeA, routeB] = routeSegments[legIndex]!;
      let legDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < airspace.points.length; i++) {
        const p1 = airspace.points[i]!;
        const p2 = airspace.points[(i + 1) % airspace.points.length]!;
        const airA = toLocalNm(p1[0], p1[1], refLat);
        const airB = toLocalNm(p2[0], p2[1], refLat);
        legDistance = Math.min(
          legDistance,
          segmentDistance(routeA, routeB, airA, airB),
        );
      }
      minDistance = Math.min(minDistance, legDistance);
      if (legDistance <= corridorNm) {
        firstLegIndex = Math.min(firstLegIndex, legIndex);
      }
    }

    waypoints.forEach((waypoint, waypointIndex) => {
      if (pointInPolygon([waypoint.lat, waypoint.lon], airspace.points)) {
        minDistance = 0;
        firstLegIndex = Math.min(
          firstLegIndex,
          Math.max(0, Math.min(routeSegments.length - 1, waypointIndex)),
        );
      }
    });

    if (minDistance > corridorNm) continue;

    const lower = parseVerticalFeet(airspace.lowerLimit, false);
    const upper = parseVerticalFeet(airspace.upperLimit, true);
    let verticalStatus: AirspaceBriefingItem["verticalStatus"] = "unknown";
    if (
      cruiseAltitudeFt != null &&
      Number.isFinite(cruiseAltitudeFt) &&
      lower != null &&
      upper != null
    ) {
      verticalStatus =
        cruiseAltitudeFt >= lower && cruiseAltitudeFt <= upper
          ? "inside"
          : "outside";
    }

    items.push({
      name: airspace.name,
      type: airspace.type,
      classCode: airspace.classCode,
      lowerLimit: airspace.lowerLimit,
      upperLimit: airspace.upperLimit,
      distanceNm: minDistance,
      firstLegIndex: Number.isFinite(firstLegIndex) ? firstLegIndex : 0,
      verticalStatus,
    });
  }

  return items.sort(
    (a, b) =>
      a.firstLegIndex - b.firstLegIndex || a.distanceNm - b.distanceNm,
  );
}
