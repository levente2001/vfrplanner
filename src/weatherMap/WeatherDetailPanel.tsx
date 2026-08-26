import { Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WeatherStation } from "@/lib/weather/types";
import { Button } from "@/ui/button";
import {
  CATEGORY_META,
  formatCeiling,
  formatClouds,
  formatTime,
  formatWind,
} from "./format";
import { TafTimeline } from "./TafTimeline";

function copy(value: string | null) {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}

export function WeatherDetailPanel({
  station,
  timeMode,
  onClose,
}: {
  station: WeatherStation | null;
  timeMode: "utc" | "local";
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [sheetState, setSheetState] = useState<"collapsed" | "medium" | "full">(
    "medium",
  );

  useEffect(() => {
    if (station) panelRef.current?.focus();
  }, [station]);

  if (!station) return null;
  const meta = CATEGORY_META[station.category];

  return (
    <aside
      ref={panelRef}
      className={`wx-detail-panel sheet-${sheetState}`}
      aria-label="Repülésmeteorológiai részletek"
      tabIndex={-1}
    >
      <div className="wx-sheet-handle" aria-hidden="true" />
      <div className="wx-panel-actions" aria-label="Mobil panel méret">
        <button
          type="button"
          onClick={() => setSheetState("collapsed")}
          aria-label="Panel összecsukása"
        />
        <button
          type="button"
          onClick={() => setSheetState("medium")}
          aria-label="Panel közepes méret"
        />
        <button
          type="button"
          onClick={() => setSheetState("full")}
          aria-label="Panel teljes méret"
        />
      </div>

      <div className="wx-detail-head">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-slate-400">
            {station.icao}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {station.name}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          aria-label="Részletek bezárása"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="wx-summary-grid">
        <Metric label="Kategória" priority>
          <span className={`rounded-md px-2 py-1 ${meta.className}`}>
            {station.category}
          </span>
        </Metric>
        <Metric label="Kor" priority>
          {station.ageMinutes == null ? "n/a" : `${station.ageMinutes} min`}
        </Metric>
        <Metric label="Szél" priority>
          {formatWind(station.wind)}
        </Metric>
        <Metric label="Látás" priority>
          {station.visibilityText}
        </Metric>
        <Metric label="Ceiling" priority>
          {formatCeiling(station.ceilingFt)}
        </Metric>
        <Metric label="QNH">
          {station.qnhHpa == null ? "n/a" : `${station.qnhHpa} hPa`}
        </Metric>
      </div>

      <div className="wx-accordion-stack">
        <details open>
          <summary>METAR</summary>
          <ReportBlock title="Raw METAR" value={station.rawMetar} />
          <ReportBlock
            title="Dekódolt METAR"
            value={`Szél: ${formatWind(station.wind)} · Látás: ${station.visibilityText} · Felhők: ${formatClouds(station.clouds)} · Jelenség: ${station.weather ?? "NSW"} · Mérés: ${formatTime(station.observedAt, timeMode)}`}
          />
          <div className="wx-detail-facts">
            <Metric label="Hőmérséklet">
              {station.temperatureC == null
                ? "n/a"
                : `${station.temperatureC} °C`}
            </Metric>
            <Metric label="Harmatpont">
              {station.dewpointC == null ? "n/a" : `${station.dewpointC} °C`}
            </Metric>
            <Metric label="Jelenség">{station.weather ?? "NSW"}</Metric>
            <Metric label="Felhők">{formatClouds(station.clouds)}</Metric>
            <Metric label="Típus">{station.reportType}</Metric>
            <Metric label="Mérés">
              {formatTime(station.observedAt, timeMode)}
            </Metric>
          </div>
        </details>

        <details open>
          <summary>TAF idővonal</summary>
          <ReportBlock title="Raw TAF" value={station.rawTaf} />
          <TafTimeline segments={station.tafSegments} timeMode={timeMode} />
        </details>

        <details>
          <summary>Adatminőség</summary>
          <div className="wx-detail-facts">
            <Metric label="Provider">{station.provider}</Metric>
            <Metric label="ICAO">{station.icao}</Metric>
            <Metric label="Elavult">{station.stale ? "igen" : "nem"}</Metric>
            <Metric label="Kiadva">
              {formatTime(station.issuedAt, timeMode)}
            </Metric>
          </div>
        </details>
      </div>

      <p className="wx-aviation-footnote">
        Nem hivatalos repülési tájékoztatás. Repülés előtt ellenőrizd a
        hivatalos forrásokat és a kötelező briefinget.
      </p>
    </aside>
  );
}

function Metric({
  label,
  children,
  priority = false,
}: {
  label: string;
  children: React.ReactNode;
  priority?: boolean;
}) {
  return (
    <div className={`wx-metric ${priority ? "is-priority" : ""}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <div className="mt-1 font-mono text-sm text-white">{children}</div>
    </div>
  );
}

function ReportBlock({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return (
    <div className="wx-report-block">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          {title}
        </p>
        <button
          type="button"
          onClick={() => copy(value)}
          className="rounded-md border border-white/10 p-1 text-slate-300 hover:text-white"
          aria-label={`${title} másolása`}
        >
          <Copy className="size-3.5" />
        </button>
      </div>
      <p className="mt-2 break-words font-mono text-xs leading-relaxed text-slate-100">
        {value ?? "n/a"}
      </p>
    </div>
  );
}
