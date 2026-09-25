import assert from "node:assert/strict";
import {
  applyMagneticVariation,
  computeLegs,
  loadAirports,
  normalizeHeading,
  resolveWaypoints,
  type WaypointMeta,
} from "../src/lib/vfr/nav";
import {
  computeWB,
  convertArm,
  convertEnvelopeArms,
  convertEnvelopeWeights,
  convertFuelAmount,
  convertFuelDensity,
  convertWeight,
  EXAMPLE_PROFILE,
  type Loads,
} from "../src/lib/vfr/wb";
import { parseOpenAir } from "../src/lib/vfr/airspace";
import {
  analyzeRouteAirspaces,
  minimumCruiseAltitude,
} from "../src/lib/vfr/briefing";
import {
  calculateFlightCategory,
  determineCeilingFt,
  isStale,
  parseVisibilitySm,
} from "../src/lib/weather/category";
import { adaptAviationWeather } from "../src/lib/weather/providers/aviationWeather";

function close(actual: number, expected: number, tolerance = 0.25) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function northLeg(tas: number, windDir: number, windSpeed: number) {
  const meta: WaypointMeta[] = [
    { label: "A", lat: 0, lon: 0 },
    { label: "B", lat: 1, lon: 0 },
  ];
  return computeLegs(
    [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
    ],
    meta,
    {
      tas,
      fuelFlow: 20,
      windDir,
      windSpeed,
      variationValue: 5,
      variationDirection: "E",
    },
  ).legs[0]!;
}

assert.equal(applyMagneticVariation(100, 5, "E"), 95);
assert.equal(applyMagneticVariation(100, 5, "W"), 105);
assert.equal(applyMagneticVariation(2, 5, "E"), 357);
assert.equal(applyMagneticVariation(358, 5, "W"), 3);
assert.equal(normalizeHeading(-1), 359);
assert.equal(normalizeHeading(361), 1);

close(northLeg(100, 0, 20).groundSpeed!, 80);
close(northLeg(100, 180, 20).groundSpeed!, 120);
const crosswind = northLeg(100, 90, 20);
close(crosswind.wca, 11.54, 0.05);
close(crosswind.groundSpeed!, 97.98, 0.1);

const impossible = northLeg(20, 0, 30);
assert.equal(impossible.groundSpeed, null);
assert.equal(impossible.ete, null);
assert.equal(impossible.fuel, null);
assert.equal(
  impossible.error,
  "The selected TAS is insufficient for the entered wind conditions.",
);

const underEnvelope = { ...EXAMPLE_PROFILE, bew: 650 };
const lightLoads: Loads = {
  wFront: 0,
  wRear: 0,
  wBag1: 0,
  wBag2: 0,
  fuelAmount: 0,
};
assert.equal(
  computeWB(underEnvelope, lightLoads).status,
  "Outside envelope weight range",
);

const heavyLoads: Loads = {
  wFront: 300,
  wRear: 150,
  wBag1: 50,
  wBag2: 0,
  fuelAmount: 120,
};
assert.equal(
  computeWB(EXAMPLE_PROFILE, heavyLoads).status,
  "Maximum weight exceeded",
);

close(convertWeight(convertWeight(100, "kg", "lb"), "lb", "kg"), 100, 0.000001);
close(convertArm(convertArm(1000, "mm", "in"), "in", "mm"), 1000, 0.000001);
close(
  convertFuelAmount(convertFuelAmount(50, "kg", "lb"), "lb", "kg"),
  50,
  0.000001,
);
close(
  convertFuelDensity(convertFuelDensity(0.72, "kg", "lb"), "lb", "kg"),
  0.72,
  0.000001,
);
assert.equal(
  convertEnvelopeWeights("100,10,20", "kg", "lb").split(",").length,
  3,
);
assert.equal(
  convertEnvelopeArms("100,1000,1200", "mm", "in").split(",").length,
  3,
);

const airspaces = parseOpenAir(`AC C
AY CTR
AN TEST CTR
AH 2500ft MSL
AL GND
DP 47:00:00 N 019:00:00 E
DP 47:10:00 N 019:00:00 E
DP 47:10:00 N 019:10:00 E
DP 47:00:00 N 019:00:00 E`);
assert.equal(airspaces.length, 1);
assert.equal(airspaces[0]!.name, "TEST CTR");
assert.equal(airspaces[0]!.points[0]![0], 47);
assert.equal(airspaces[0]!.points[0]![1], 19);

assert.equal(minimumCruiseAltitude("1840"), 2900);
assert.equal(minimumCruiseAltitude("6000"), 8000);
assert.equal(minimumCruiseAltitude(""), null);

const briefingRoute: WaypointMeta[] = [
  { label: "A", lat: 47.05, lon: 18.9 },
  { label: "B", lat: 47.05, lon: 19.2 },
];
const briefingAirspace = {
  name: "TEST TMA",
  classCode: "C",
  type: "TMA",
  lowerLimit: "1000 FT AMSL",
  upperLimit: "2500 FT AMSL",
  points: [
    [47, 19],
    [47, 19.1],
    [47.1, 19.1],
    [47.1, 19],
  ] as Array<[number, number]>,
};
assert.equal(
  analyzeRouteAirspaces(briefingRoute, [briefingAirspace], 5, 1500)[0]!
    .verticalStatus,
  "inside",
);
assert.equal(
  analyzeRouteAirspaces(briefingRoute, [briefingAirspace], 5, 3500)[0]!
    .verticalStatus,
  "outside",
);

const airports = await loadAirports();
assert.equal((await resolveWaypoints("LHBC LHBP", airports))[0]!.label, "LHBC");
assert.equal((await resolveWaypoints("LHBS LHBP", airports))[0]!.label, "LHBS");
assert.equal((await resolveWaypoints("LHMC LHFM", airports))[0]!.label, "LHMC");
assert.equal(
  (await resolveWaypoints("Békéscsaba Budapest", airports))[0]!.label,
  "Békéscsaba",
);
assert.equal(
  (await resolveWaypoints("bekescsaba; liszt ferenc", airports))[1]!.label,
  "Budapest",
);
assert.equal(
  (await resolveWaypoints("alcsutdoboz LHBS", airports))[0]!.label,
  "Alcsútdoboz",
);
assert.equal((await resolveWaypoints("Békés", airports))[0]!.label, "Békés");
assert.equal((await resolveWaypoints("bekes", airports))[0]!.label, "Békés");
assert.equal((await resolveWaypoints("Földes", airports))[0]!.label, "Földes");
assert.equal(
  (await resolveWaypoints("Kálmánháza", airports))[0]!.label,
  "Kálmánháza",
);
assert.equal(
  (await resolveWaypoints("Nyíradony", airports))[0]!.label,
  "Nyíradony",
);
assert.equal((await resolveWaypoints("Doboz", airports))[0]!.label, "Doboz");
const hungarianNavWaypoints = await resolveWaypoints("JOZA PERIT", airports);
assert.equal(hungarianNavWaypoints[0]!.label, "JOZA");
assert.equal(hungarianNavWaypoints[1]!.label, "PERIT");
close(hungarianNavWaypoints[0]!.lat, 47.5925, 0.0001);
close(hungarianNavWaypoints[0]!.lon, 21.5572, 0.0001);
close(hungarianNavWaypoints[1]!.lat, 47.7883, 0.0001);
close(hungarianNavWaypoints[1]!.lon, 21.6228, 0.0001);
assert.equal(
  (await resolveWaypoints("joza; perit", airports))[1]!.label,
  "PERIT",
);
const bekesNavaids = await resolveWaypoints("bks BC", airports);
assert.equal(bekesNavaids[0]!.label, "BKS");
assert.equal(bekesNavaids[1]!.label, "BC");
close(bekesNavaids[0]!.lat, 46.799972, 0.000001);
close(bekesNavaids[0]!.lon, 21.073889, 0.000001);
close(bekesNavaids[1]!.lat, 46.664889, 0.000001);
close(bekesNavaids[1]!.lon, 21.165083, 0.000001);
assert.equal((await resolveWaypoints("balaton", airports))[0]!.label, "Hévíz");
assert.equal(
  (await resolveWaypoints("BALATON", airports))[0]!.label,
  "BALATON",
);

assert.equal(
  determineCeilingFt([
    { cover: "FEW", baseFt: 800 },
    { cover: "BKN", baseFt: 2400 },
  ]),
  2400,
);
assert.equal(
  determineCeilingFt([
    { cover: "SCT", baseFt: 900 },
    { cover: "OVC", baseFt: 1200 },
  ]),
  1200,
);
assert.equal(determineCeilingFt([{ cover: "VV", baseFt: 300 }]), 300);
assert.equal(determineCeilingFt([{ cover: "FEW", baseFt: 300 }]), null);
assert.equal(
  calculateFlightCategory({ ceilingFt: null, visibilitySm: 6 }),
  "VFR",
);
assert.equal(
  calculateFlightCategory({ ceilingFt: 2500, visibilitySm: 6 }),
  "MVFR",
);
assert.equal(
  calculateFlightCategory({ ceilingFt: 800, visibilitySm: 6 }),
  "IFR",
);
assert.equal(
  calculateFlightCategory({ ceilingFt: 300, visibilitySm: 6 }),
  "LIFR",
);
assert.equal(
  calculateFlightCategory({ ceilingFt: null, visibilitySm: null }),
  "UNKNOWN",
);
assert.equal(
  calculateFlightCategory({ ceilingFt: null, visibilitySm: 6, stale: true }),
  "UNKNOWN",
);
assert.equal(parseVisibilitySm("6+"), 6);
assert.equal(parseVisibilitySm("1 1/2"), 1.5);
assert.equal(
  isStale(
    "2026-08-26T10:00:00.000Z",
    90,
    Date.parse("2026-08-26T11:31:00.000Z"),
  ),
  true,
);
assert.equal(
  isStale(
    "2026-08-26T10:05:00.000Z",
    90,
    Date.parse("2026-08-26T11:31:00.000Z"),
  ),
  false,
);

const adapted = adaptAviationWeather(
  [
    {
      icaoId: "LHZZ",
      reportTime: "2026-08-26T11:00:00.000Z",
      metarType: "SPECI",
      rawOb: "SPECI LHZZ 261100Z VRB04KT CAVOK 20/10 Q1015",
      lat: 47,
      lon: 19,
      name: "Test Hungary",
      wdir: "VRB",
      wspd: 4,
      visib: "6+",
      altim: 1015,
      clouds: [
        { cover: "FEW", base: 1000 },
        { cover: "BKN", base: 3500 },
      ],
    },
  ],
  [
    {
      icaoId: "LHZZ",
      issueTime: "2026-08-26T10:30:00.000Z",
      rawTAF: "TAF LHZZ 2611/2618 VRB04KT CAVOK",
      fcsts: [
        {
          timeFrom: 1787742000,
          timeTo: 1787767200,
          fcstChange: null,
          wdir: "VRB",
          wspd: 4,
          visib: "6+",
          clouds: [],
        },
      ],
    },
  ],
  90,
  Date.parse("2026-08-26T11:45:00.000Z"),
);
assert.equal(adapted.length, 1);
assert.equal(adapted[0]!.reportType, "SPECI");
assert.equal(adapted[0]!.wind.direction, "VRB");
assert.equal(adapted[0]!.ceilingFt, 3500);
assert.equal(adapted[0]!.category, "VFR");
assert.equal(adapted[0]!.tafSegments[0]!.type, "BASE");

console.log("vfrplanner formula tests passed");
