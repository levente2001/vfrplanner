import assert from "node:assert/strict";
import {
  calculatePerformance,
  csvHeader,
  distanceMargin,
  parsePerformanceCsv,
  pressureAltitude,
  profileCsv,
} from "../src/aircraft/performance";
import type {
  PerformancePoint,
  PerformanceProfile,
} from "../src/aircraft/types";

// Synthetic data only: these fixtures are not aircraft performance data.
const point = (values: Partial<PerformancePoint> = {}): PerformancePoint => ({
  weightKg: 1000,
  pressureAltitudeFt: 0,
  temperatureC: 10,
  headwindKt: 0,
  slopePercent: 0,
  groundRollM: 200,
  distanceM: 400,
  accelerateStopM: null,
  ...values,
});
const profile = (
  points: PerformancePoint[],
  values: Partial<PerformanceProfile> = {},
): PerformanceProfile => ({
  id: "test",
  name: "Synthetic",
  documentId: "test-doc",
  source: "Test fixture",
  configuration: "Test only",
  phase: "takeoff",
  surface: "paved",
  condition: "dry",
  obstacleHeightFt: 50,
  interpolation: "linear",
  verified: true,
  points,
  ...values,
});

const base = point();
assert.deepEqual(calculatePerformance(profile([base]), base), {
  groundRollM: 200,
  distanceM: 400,
  accelerateStopM: null,
  interpolated: false,
});
assert.throws(
  () => calculatePerformance(profile([base], { verified: false }), base),
  /Verify/,
);
assert.throws(
  () => calculatePerformance(profile([base]), { ...base, temperatureC: 20 }),
  /outside/,
);
assert.throws(
  () => calculatePerformance(profile([base]), { ...base, weightKg: NaN }),
  /valid/,
);

const grid: PerformancePoint[] = [];
for (const weightKg of [1000, 1200])
  for (const pressureAltitudeFt of [0, 2000])
    for (const temperatureC of [10, 30])
      for (const headwindKt of [-10, 10])
        for (const slopePercent of [-1, 1]) {
          const groundRollM =
            200 +
            (weightKg - 1000) +
            pressureAltitudeFt / 10 +
            temperatureC * 2 -
            headwindKt * 2 +
            slopePercent * 10;
          grid.push(
            point({
              weightKg,
              pressureAltitudeFt,
              temperatureC,
              headwindKt,
              slopePercent,
              groundRollM,
              distanceM: groundRollM * 2,
              accelerateStopM: groundRollM * 3,
            }),
          );
        }
const midpoint = {
  weightKg: 1100,
  pressureAltitudeFt: 1000,
  temperatureC: 20,
  headwindKt: 0,
  slopePercent: 0,
};
const result = calculatePerformance(profile(grid), midpoint);
assert.equal(result.groundRollM, 440);
assert.equal(result.distanceM, 880);
assert.equal(result.accelerateStopM, 1320);
assert.equal(result.interpolated, true);
assert.throws(
  () =>
    calculatePerformance(profile(grid, { interpolation: "exact" }), midpoint),
  /exact/,
);
assert.throws(
  () => calculatePerformance(profile(grid.slice(1)), midpoint),
  /incomplete/,
);
assert.throws(
  () => calculatePerformance(profile(grid), { ...midpoint, headwindKt: -11 }),
  /outside/,
);
const missingStop = grid.map((item, index) =>
  index === 0 ? { ...item, accelerateStopM: null } : item,
);
assert.equal(
  calculatePerformance(profile(missingStop), midpoint).accelerateStopM,
  null,
);
assert.equal(
  calculatePerformance(profile(grid), grid[0]).groundRollM,
  grid[0].groundRollM,
);

assert.deepEqual(parsePerformanceCsv(profileCsv(profile(grid))), grid);
assert.deepEqual(parsePerformanceCsv(`${csvHeader}\n1000,0,10,0,0,200,400,`), [
  base,
]);
assert.throws(
  () =>
    parsePerformanceCsv(
      `${csvHeader}\n1000,0,10,0,0,200,400,\n1000,0,10,0,0,250,450,`,
    ),
  /duplicate/,
);
assert.throws(
  () => parsePerformanceCsv(`${csvHeader}\n1000,,10,0,0,200,400,`),
  /required/,
);
assert.throws(
  () => parsePerformanceCsv(`${csvHeader}\n1000,0,10,0,0,500,400,`),
  /distances/,
);
assert.throws(
  () => parsePerformanceCsv(`${csvHeader}\n1000,0,10,0,0,Infinity,400,`),
  /invalid/,
);
assert.throws(() => parsePerformanceCsv(csvHeader), /at least/);
assert.equal(pressureAltitude(1000, 1013.25), 1000);
assert(pressureAltitude(1000, 990) > 1000);
assert(pressureAltitude(1000, 1030) < 1000);
assert.throws(() => pressureAltitude(1000, 0), /Invalid/);
assert.deepEqual(distanceMargin(600, 800), {
  remainingM: 200,
  sufficient: true,
});
assert.deepEqual(distanceMargin(900, 800), {
  remainingM: -100,
  sufficient: false,
});
assert.equal(distanceMargin(null, 800), null);
assert.equal(distanceMargin(600, null), null);
assert.equal(distanceMargin(600, 0), null);
console.log("Aircraft performance tests passed.");
