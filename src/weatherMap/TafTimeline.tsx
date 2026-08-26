import type { TafSegment } from "@/lib/weather/types";
import {
  formatClouds,
  formatTime,
  formatWind,
  tafSegmentClass,
} from "./format";

export function TafTimeline({
  segments,
  timeMode,
}: {
  segments: TafSegment[];
  timeMode: "utc" | "local";
}) {
  if (!segments.length) {
    return (
      <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
        Nincs strukturált TAF szakasz.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2" aria-label="TAF idővonal">
      <div className="flex min-w-max gap-3">
        {segments.map((segment) => (
          <button
            key={segment.id}
            type="button"
            className={`w-64 rounded-md border p-3 text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-sky-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${tafSegmentClass(segment)}`}
            title={`${formatWind(segment.wind)} ${segment.visibilityText} ${segment.weather ?? ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">
                {segment.type}
                {segment.probability ? ` ${segment.probability}%` : ""}
              </span>
              <span className="font-mono text-[10px] opacity-80">
                {segment.visibilityText}
              </span>
            </div>
            <p className="mt-2 text-xs opacity-85">
              {formatTime(segment.from, timeMode)} -{" "}
              {formatTime(segment.to, timeMode)}
            </p>
            <p className="mt-3 font-mono text-sm">{formatWind(segment.wind)}</p>
            <p className="mt-2 truncate text-xs opacity-85">
              {segment.weather ?? "NSW"} · {formatClouds(segment.clouds)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
