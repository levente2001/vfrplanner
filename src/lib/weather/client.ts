import type { WeatherStation } from "./types";

type WeatherResponse = {
  provider: "aviationweather" | "checkwx";
  stations: WeatherStation[];
  generatedAt: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let inFlight: Promise<WeatherResponse> | null = null;
let cached: { expiresAt: number; data: WeatherResponse } | null = null;

export async function fetchWeatherStations({
  force = false,
  signal,
}: { force?: boolean; signal?: AbortSignal } = {}) {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;
  if (!force && inFlight) return inFlight;

  inFlight = fetch("/api/weather/stations", { signal })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.error ?? `Weather request failed with HTTP ${response.status}.`,
        );
      }
      if (!Array.isArray(data?.stations))
        throw new Error("Weather response failed validation.");
      const normalized = data as WeatherResponse;
      cached = { expiresAt: Date.now() + CACHE_TTL_MS, data: normalized };
      return normalized;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function clearWeatherCache() {
  cached = null;
}
