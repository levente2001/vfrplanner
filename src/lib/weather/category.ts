import type { FlightCategory, WeatherCloud } from "./types";

const CEILING_COVERS = new Set(["BKN", "OVC", "VV"]);

export function determineCeilingFt(clouds: WeatherCloud[]) {
  const ceilings = clouds
    .filter((cloud) => CEILING_COVERS.has(cloud.cover.toUpperCase()))
    .map((cloud) => cloud.baseFt)
    .filter(
      (base): base is number =>
        typeof base === "number" && Number.isFinite(base),
    );
  return ceilings.length ? Math.min(...ceilings) : null;
}

export function calculateFlightCategory({
  ceilingFt,
  visibilitySm,
  stale = false,
}: {
  ceilingFt: number | null;
  visibilitySm: number | null;
  stale?: boolean;
}): FlightCategory {
  if (stale || visibilitySm == null) return "UNKNOWN";
  if ((ceilingFt != null && ceilingFt < 500) || visibilitySm < 1) return "LIFR";
  if ((ceilingFt != null && ceilingFt < 1000) || visibilitySm < 3) return "IFR";
  if ((ceilingFt != null && ceilingFt < 3000) || visibilitySm < 5)
    return "MVFR";
  return "VFR";
}

export function parseVisibilitySm(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  if (value === "6+") return 6;
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const mixed = value.match(/^(\d+) (\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const numeric = Number(value.replace("+", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function isStale(
  observedAt: string | null,
  staleAfterMinutes = 90,
  now = Date.now(),
) {
  if (!observedAt) return true;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return true;
  return now - observedMs > staleAfterMinutes * 60_000;
}

export function ageMinutes(observedAt: string | null, now = Date.now()) {
  if (!observedAt) return null;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return null;
  return Math.max(0, Math.round((now - observedMs) / 60_000));
}
