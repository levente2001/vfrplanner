import { useEffect, useMemo, useState } from "react";
import { TileLayer, useMapEvents } from "react-leaflet";
import { Pause, Play } from "lucide-react";
import {
  fetchRainViewerFrames,
  rainViewerTileUrl,
  type RainViewerState,
} from "@/lib/weather/rainviewer";

export function RadarLayer({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<RainViewerState | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.55);
  const [zoom, setZoom] = useState(7);
  const frame = state?.frames[index] ?? null;
  const radarVisible = zoom <= 12;

  useMapEvents({
    zoomend(event) {
      setZoom(event.target.getZoom());
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchRainViewerFrames(controller.signal)
      .then((next) => {
        setState(next);
        setIndex(Math.max(0, next.frames.length - 1));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => {
    if (!playing || !state?.frames.length) return;
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % state.frames.length),
      700,
    );
    return () => window.clearInterval(id);
  }, [playing, state]);

  const tileUrl = useMemo(
    () => (state ? rainViewerTileUrl(state, index) : null),
    [state, index],
  );

  if (!enabled) return null;

  return (
    <>
      {tileUrl && radarVisible ? (
        <TileLayer
          url={tileUrl}
          opacity={zoom > 10 ? opacity * 0.55 : opacity}
          zIndex={420}
          maxNativeZoom={7}
          maxZoom={18}
          keepBuffer={2}
          updateWhenIdle
          updateWhenZooming={false}
          attribution={
            'Weather data by <a href="https://www.rainviewer.com/">RainViewer</a>'
          }
        />
      ) : null}
      <div className="wx-radar-control" aria-label="RainViewer radar vezérlés">
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-label={
            playing
              ? "Radar animáció szüneteltetése"
              : "Radar animáció indítása"
          }
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <label>
          <span>Idő</span>
          <input
            type="range"
            min="0"
            max={Math.max(0, (state?.frames.length ?? 1) - 1)}
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            aria-label="Radar időcsúszka"
          />
        </label>
        <label>
          <span>Opacitás</span>
          <input
            type="range"
            min="0.2"
            max="0.9"
            step="0.05"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            aria-label="Radar átlátszóság"
          />
        </label>
        <span className="wx-radar-time">
          {frame
            ? new Date(frame.time * 1000).toLocaleTimeString("hu-HU")
            : "n/a"}
        </span>
        {!radarVisible ? (
          <span className="wx-radar-notice">
            A radar ezen a nagyításon rejtve van.
          </span>
        ) : null}
      </div>
    </>
  );
}
