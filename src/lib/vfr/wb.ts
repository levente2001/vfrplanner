export type EnvelopePoint = {
  w: number;
  min: number;
  max: number;
};

export type Profile = {
  id: string;
  name: string;
  unitWeight: "kg" | "lb";
  unitArm: "mm" | "in";
  bew: number;
  beArm: number;
  armFront: number;
  armRear: number;
  armFuel: number;
  armBag1: number;
  armBag2: number;
  fuelDensity: number;
  maxWeight: number;
  minCG: number;
  maxCG: number;
  envelope: string;
};

export type Loads = {
  wFront: number;
  wRear: number;
  wBag1: number;
  wBag2: number;
  fuelAmount: number;
};

export type WBStatus =
  | "Within limits"
  | "CG out of range"
  | "Maximum weight exceeded"
  | "Outside envelope weight range"
  | "Invalid or incomplete profile";

export const LS_KEY = "vfrplanner.wb.profiles";
export const LS_SEL = "vfrplanner.wb.selected";
export const KG_TO_LB = 2.2046226218;
export const MM_TO_IN = 0.0393700787;
export const L_TO_US_GAL = 0.2641720524;

export const EXAMPLE_PROFILE: Profile = {
  id: "c172-example",
  name: "C172 example",
  unitWeight: "kg",
  unitArm: "mm",
  bew: 708,
  beArm: 1000,
  armFront: 940,
  armRear: 1850,
  armFuel: 1220,
  armBag1: 2080,
  armBag2: 2400,
  fuelDensity: 0.72,
  maxWeight: 1043,
  minCG: 880,
  maxCG: 1200,
  envelope: "700,880,1200\n900,920,1200\n1043,980,1160",
};

export function blankProfile(): Profile {
  return {
    ...EXAMPLE_PROFILE,
    id: `profile-${Date.now()}`,
    name: "New aircraft",
  };
}

export function computeWB(profile: Profile, loads: Loads) {
  const fuelWeight = loads.fuelAmount * profile.fuelDensity;
  const W =
    profile.bew + loads.wFront + loads.wRear + loads.wBag1 + loads.wBag2 + fuelWeight;
  const M =
    profile.bew * profile.beArm +
    loads.wFront * profile.armFront +
    loads.wRear * profile.armRear +
    loads.wBag1 * profile.armBag1 +
    loads.wBag2 * profile.armBag2 +
    fuelWeight * profile.armFuel;
  const CG = W > 0 ? M / W : 0;
  const env = parseEnvelope(profile.envelope);
  const limits = limitsFor(W, profile, env);
  const status = statusFor(W, CG, profile, env, limits);

  return {
    W,
    M,
    CG,
    env,
    minL: limits?.minL ?? profile.minCG,
    maxL: limits?.maxL ?? profile.maxCG,
    withinLimits: status === "Within limits",
    status,
  };
}

export function convertWeight(value: number, from: Profile["unitWeight"], to: Profile["unitWeight"]) {
  if (from === to) return value;
  return from === "kg" ? value * KG_TO_LB : value / KG_TO_LB;
}

export function convertArm(value: number, from: Profile["unitArm"], to: Profile["unitArm"]) {
  if (from === to) return value;
  return from === "mm" ? value * MM_TO_IN : value / MM_TO_IN;
}

export function convertFuelAmount(
  value: number,
  from: Profile["unitWeight"],
  to: Profile["unitWeight"],
) {
  if (from === to) return value;
  return from === "kg" ? value * L_TO_US_GAL : value / L_TO_US_GAL;
}

export function convertFuelDensity(
  value: number,
  from: Profile["unitWeight"],
  to: Profile["unitWeight"],
) {
  if (from === to) return value;
  return from === "kg" ? value * (KG_TO_LB / L_TO_US_GAL) : value / (KG_TO_LB / L_TO_US_GAL);
}

export function convertEnvelopeWeights(
  text: string,
  from: Profile["unitWeight"],
  to: Profile["unitWeight"],
) {
  return mapEnvelope(text, ([w, min, max]) => [convertWeight(w, from, to), min, max]);
}

export function convertEnvelopeArms(text: string, from: Profile["unitArm"], to: Profile["unitArm"]) {
  return mapEnvelope(text, ([w, min, max]) => [w, convertArm(min, from, to), convertArm(max, from, to)]);
}

export function parseEnvelope(text: string): EnvelopePoint[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((part) => Number(part.trim())))
    .filter((parts) => parts.length >= 3 && parts.every(Number.isFinite))
    .map(([w, min, max]) => ({ w: w!, min: min!, max: max! }))
    .sort((a, b) => a.w - b.w);
}

function limitsFor(weight: number, profile: Profile, env: EnvelopePoint[]) {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (env.length < 2) {
    return { minL: profile.minCG, maxL: profile.maxCG };
  }
  if (weight < env[0]!.w || weight > env[env.length - 1]!.w) return null;
  for (let i = 0; i < env.length - 1; i++) {
    const a = env[i]!;
    const b = env[i + 1]!;
    if (weight >= a.w && weight <= b.w) {
      const t = (weight - a.w) / (b.w - a.w || 1);
      return {
        minL: a.min + (b.min - a.min) * t,
        maxL: a.max + (b.max - a.max) * t,
      };
    }
  }
  return null;
}

function statusFor(
  weight: number,
  cg: number,
  profile: Profile,
  env: EnvelopePoint[],
  limits: { minL: number; maxL: number } | null,
): WBStatus {
  const profileValues = [
    profile.bew,
    profile.beArm,
    profile.armFront,
    profile.armRear,
    profile.armFuel,
    profile.armBag1,
    profile.armBag2,
    profile.fuelDensity,
    profile.maxWeight,
    profile.minCG,
    profile.maxCG,
  ];
  if (!profileValues.every(Number.isFinite) || profile.fuelDensity < 0 || !Number.isFinite(cg)) {
    return "Invalid or incomplete profile";
  }
  if (env.length > 0 && env.length < 2) return "Invalid or incomplete profile";
  if (profile.maxWeight > 0 && weight > profile.maxWeight) return "Maximum weight exceeded";
  if (!limits) return "Outside envelope weight range";
  if (cg < limits.minL || cg > limits.maxL) return "CG out of range";
  return "Within limits";
}

function mapEnvelope(text: string, convert: (parts: [number, number, number]) => [number, number, number]) {
  return text
    .split(/\n/)
    .map((line) => {
      const parts = line.split(",").map((part) => Number(part.trim()));
      if (parts.length < 3 || !parts.every(Number.isFinite)) return line;
      return convert([parts[0]!, parts[1]!, parts[2]!]).map((value) => trimNumber(value)).join(",");
    })
    .join("\n");
}

function trimNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}
