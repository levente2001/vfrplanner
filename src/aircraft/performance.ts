import type { PerformancePoint, PerformanceProfile } from "./types";

export const axes = [
  "weightKg",
  "pressureAltitudeFt",
  "temperatureC",
  "headwindKt",
  "slopePercent",
] as const;
export const csvHeader = [
  ...axes,
  "groundRollM",
  "distanceM",
  "accelerateStopM",
].join(",");
export type PerformanceConditions = Pick<
  PerformancePoint,
  (typeof axes)[number]
>;

export function parsePerformanceCsv(text: string): PerformancePoint[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.shift()?.trim() !== csvHeader)
    throw new Error("Use the column names and order from the CSV template.");
  if (!lines.length) throw new Error("Enter at least one POH data row.");
  if (lines.length > 10000)
    throw new Error("A profile may contain at most 10,000 data rows.");
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== 8 || cells.slice(0, 7).some((cell) => !cell))
      throw new Error(
        `Row ${index + 2}: enter all seven required values and an optional accelerate-stop distance.`,
      );
    const values = cells.map((cell) => (cell === "" ? null : Number(cell)));
    if (values.some((value) => value !== null && !Number.isFinite(value)))
      throw new Error(
        `Row ${index + 2}: invalid number. Use decimal points, not decimal commas.`,
      );
    const [
      weightKg,
      pressureAltitudeFt,
      temperatureC,
      headwindKt,
      slopePercent,
      groundRollM,
      distanceM,
      accelerateStopM,
    ] = values as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number | null,
    ];
    if (
      weightKg <= 0 ||
      groundRollM <= 0 ||
      distanceM < groundRollM ||
      (accelerateStopM !== null && accelerateStopM <= 0)
    )
      throw new Error(
        `Row ${index + 2}: check weight and distances (total distance must be at least ground roll).`,
      );
    const key = values.slice(0, 5).join(",");
    if (seen.has(key))
      throw new Error(`Row ${index + 2}: duplicate conditions.`);
    seen.add(key);
    return {
      weightKg,
      pressureAltitudeFt,
      temperatureC,
      headwindKt,
      slopePercent,
      groundRollM,
      distanceM,
      accelerateStopM,
    };
  });
}

export function profileCsv(profile: PerformanceProfile) {
  return [
    csvHeader,
    ...profile.points.map((point) =>
      [
        ...axes.map((axis) => point[axis]),
        point.groundRollM,
        point.distanceM,
        point.accelerateStopM ?? "",
      ].join(","),
    ),
  ].join("\n");
}

export function calculatePerformance(
  profile: PerformanceProfile,
  conditions: PerformanceConditions,
) {
  if (!profile.verified)
    throw new Error(
      "Verify this profile against the aircraft POH before calculating.",
    );
  if (!profile.points.length) throw new Error("This profile has no POH data.");
  if (
    axes.some((axis) => !Number.isFinite(conditions[axis])) ||
    conditions.weightKg <= 0
  )
    throw new Error("Enter valid performance conditions.");
  const exact = profile.points.find((point) =>
    axes.every((axis) => Math.abs(point[axis] - conditions[axis]) < 1e-8),
  );
  if (exact)
    return {
      groundRollM: exact.groundRollM,
      distanceM: exact.distanceM,
      accelerateStopM: exact.accelerateStopM,
      interpolated: false,
    };
  if (profile.interpolation !== "linear")
    throw new Error(
      "No exact POH row matches these conditions. This profile does not permit interpolation.",
    );
  const bounds = axes.map((axis) => {
    const values = [
      ...new Set(profile.points.map((point) => point[axis])),
    ].sort((a, b) => a - b);
    const value = conditions[axis];
    if (value < values[0] || value > values[values.length - 1])
      throw new Error(
        `${axis}: outside the verified POH range (${values[0]}–${values[values.length - 1]}). No extrapolation.`,
      );
    const low = values.filter((item) => item <= value).pop()!;
    const high = values.find((item) => item >= value)!;
    return low === high
      ? [{ value: low, factor: 1 }]
      : [
          { value: low, factor: (high - value) / (high - low) },
          { value: high, factor: (value - low) / (high - low) },
        ];
  });
  let corners: { values: number[]; factor: number }[] = [
    { values: [], factor: 1 },
  ];
  for (const bound of bounds)
    corners = corners.flatMap((corner) =>
      bound.map((item) => ({
        values: [...corner.values, item.value],
        factor: corner.factor * item.factor,
      })),
    );
  let groundRollM = 0;
  let distanceM = 0;
  let accelerateStopM: number | null = 0;
  for (const corner of corners) {
    const point = profile.points.find((item) =>
      axes.every((axis, index) => item[axis] === corner.values[index]),
    );
    if (!point)
      throw new Error(
        "The POH grid is incomplete for these conditions. Add the missing surrounding data rows.",
      );
    groundRollM += point.groundRollM * corner.factor;
    distanceM += point.distanceM * corner.factor;
    accelerateStopM =
      accelerateStopM === null || point.accelerateStopM === null
        ? null
        : accelerateStopM + point.accelerateStopM * corner.factor;
  }
  return { groundRollM, distanceM, accelerateStopM, interpolated: true };
}

export function pressureAltitude(elevationFt: number, qnhHpa: number) {
  if (!Number.isFinite(elevationFt) || !Number.isFinite(qnhHpa) || qnhHpa <= 0)
    throw new Error("Invalid elevation or QNH.");
  // ISA altimeter relation, feet / hPa. This is pressure altitude, not density altitude.
  return elevationFt + 145366.45 * (1 - (qnhHpa / 1013.25) ** 0.190284);
}

export function distanceMargin(
  requiredM: number | null,
  availableM: number | null,
) {
  if (
    requiredM === null ||
    availableM === null ||
    !Number.isFinite(requiredM) ||
    !Number.isFinite(availableM) ||
    requiredM <= 0 ||
    availableM <= 0
  )
    return null;
  return {
    remainingM: availableM - requiredM,
    sufficient: availableM >= requiredM,
  };
}
