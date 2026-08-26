export type RainViewerFrame = {
  time: number;
  path: string;
};

export type RainViewerState = {
  host: string;
  generated: number;
  frames: RainViewerFrame[];
};

let inFlight: Promise<RainViewerState> | null = null;
let cached: { expiresAt: number; data: RainViewerState } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchRainViewerFrames(signal?: AbortSignal) {
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (inFlight) return inFlight;

  inFlight = fetch("/api/rainviewer", { signal })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error ?? `RainViewer HTTP ${response.status}`);
      const frames = [
        ...(data?.radar?.past ?? []),
        ...(data?.radar?.nowcast ?? []),
      ].filter(
        (frame) =>
          typeof frame?.time === "number" && typeof frame?.path === "string",
      );
      if (typeof data?.host !== "string" || !frames.length) {
        throw new Error("RainViewer metadata response failed validation.");
      }
      const normalized = { host: data.host, generated: data.generated, frames };
      cached = { expiresAt: Date.now() + CACHE_TTL_MS, data: normalized };
      return normalized;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function rainViewerTileUrl(state: RainViewerState, frameIndex: number) {
  const frame =
    state.frames[Math.max(0, Math.min(state.frames.length - 1, frameIndex))];
  return `${state.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}
