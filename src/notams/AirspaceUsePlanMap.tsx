import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type {
  AirspaceUsePlanArea,
  AirspaceUsePlanResponse,
  AirspaceUsePlanType,
} from "@/lib/airspaceUsePlan";
import { Alert, AlertDescription } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

const TYPE_LABELS: Record<AirspaceUsePlanType, string> = {
  "MCTR/MTMA": "MCTR/MTMA",
  TRA: "TRA",
  DA: "DA",
  AR: "Area restriction",
  TA: "Temporary area",
  UNKNOWN: "Other",
};

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function styleForArea(type: AirspaceUsePlanType) {
  if (type === "DA") {
    return { color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.38, weight: 2.4 };
  }
  if (type === "AR") {
    return { color: "#d97706", fillColor: "#fbbf24", fillOpacity: 0.42, weight: 2.2 };
  }
  if (type === "TA") {
    return { color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.34, weight: 2 };
  }
  if (type === "TRA") {
    return { color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 0.34, weight: 2.2 };
  }
  if (type === "MCTR/MTMA") {
    return { color: "#6d28d9", fillColor: "#a78bfa", fillOpacity: 0.26, weight: 1.9 };
  }
  return { color: "#475569", fillColor: "#94a3b8", fillOpacity: 0.26, weight: 1.7 };
}

function centroid(points: Array<[number, number]>) {
  const sum = points.reduce(
    (acc, point) => ({ lat: acc.lat + point[0], lon: acc.lon + point[1] }),
    { lat: 0, lon: 0 },
  );
  return [sum.lat / points.length, sum.lon / points.length] as [number, number];
}

function buildPopup(area: AirspaceUsePlanArea) {
  const wrap = document.createElement("div");
  wrap.className = "leaflet-airspace-popup";

  const title = document.createElement("strong");
  title.textContent = area.designator;

  const type = document.createElement("div");
  type.textContent = `Type: ${TYPE_LABELS[area.type] ?? area.type}`;

  const limits = document.createElement("div");
  limits.textContent = `Limits: ${area.lowerLimit} - ${area.upperLimit}`;

  const time = document.createElement("div");
  time.textContent = `Active: ${area.start} - ${area.end} UTC`;

  wrap.append(title, document.createElement("br"), type, limits, time);
  return wrap;
}

export function AirspaceUsePlanMap() {
  const [date, setDate] = useState(currentUtcDate);
  const [areas, setAreas] = useState<AirspaceUsePlanArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fitted, setFitted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const area of areas) {
      result[area.type] = (result[area.type] ?? 0) + 1;
    }
    return result;
  }, [areas]);

  async function loadPlan(nextDate = date) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: nextDate });
      const response = await fetch(`/api/airspace-use-plan?${params}`);
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `Airspace use plan HTTP ${response.status}`);
      }
      const data = (await response.json()) as AirspaceUsePlanResponse;
      setAreas(data.areas);
      setFitted(false);
    } catch (loadError) {
      setAreas([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Airspace use plan could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    (async () => {
      const leaflet = await import("leaflet");
      const L = leaflet.default ?? leaflet;
      if (disposed || !containerRef.current || mapRef.current) return;

      LRef.current = L;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerIcon2x,
        iconUrl: markerIcon,
        shadowUrl: markerShadow,
      });

      const map = L.map(containerRef.current, { zoomControl: true }).setView(
        [47.16, 19.5],
        7,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.createPane("asupPane");
      const pane = map.getPane("asupPane");
      if (pane) pane.style.zIndex = "360";
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    })();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    void loadPlan(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    for (const area of areas) {
      const polygon = L.polygon(area.points, {
        ...styleForArea(area.type),
        pane: "asupPane",
      });
      polygon.bindPopup(() => buildPopup(area));
      polygon.on("add", () => {
        const element = polygon.getElement?.();
        if (element) element.setAttribute("tabindex", "-1");
      });
      polygon.on("click", () => {
        const element = polygon.getElement?.();
        if (element instanceof SVGElement) element.blur();
      });
      polygon.bindTooltip(area.designator, {
        direction: "center",
        permanent: false,
        sticky: true,
      });
      layer.addLayer(polygon);
    }

    if (!fitted && areas.length) {
      map.fitBounds(
        L.latLngBounds(areas.flatMap((area) => area.points)),
        { padding: [24, 24] },
      );
      setFitted(true);
    }
  }, [areas, fitted]);

  return (
    <div className="asup-map relative min-h-[560px] overflow-hidden bg-panel-muted sm:min-h-[680px] lg:min-h-[760px]">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="absolute left-3 right-3 top-3 z-[500] lg:right-auto lg:w-[420px]">
        <div className="rounded-md border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs font-semibold uppercase text-foreground">
              Airspace use plan
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-8 w-[148px] bg-background font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                className="size-8 bg-background"
                onClick={() => void loadPlan(date)}
                disabled={loading}
                aria-label="Reload airspace use plan"
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Badge variant="outline">{areas.length} areas</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2">
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const count = counts[type] ?? 0;
          if (!count) return null;
          const style = styleForArea(type as AirspaceUsePlanType);
          return (
            <Badge
              key={type}
              variant="secondary"
              className="gap-2 border border-border bg-background/95 font-mono"
            >
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: style.fillColor, border: `1px solid ${style.color}` }}
              />
              {label}: {count}
            </Badge>
          );
        })}
      </div>

      {error && (
        <div className="absolute inset-x-3 top-28 z-[500] lg:left-auto lg:w-[420px]">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
