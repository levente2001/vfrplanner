import { useEffect, useRef } from "react";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { parseOpenAir, type Airspace } from "@/lib/vfr/airspace";
import type { Airport, LatLng, WaypointMeta } from "@/lib/vfr/nav";

function styleForAirspace(airspace: Airspace) {
  const type = airspace.type.toUpperCase();
  if (type === "P") {
    return { color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.08, weight: 1.4 };
  }
  if (type === "R") {
    return { color: "#f97316", fillColor: "#f97316", fillOpacity: 0.07, weight: 1.2 };
  }
  if (type === "Q") {
    return { color: "#eab308", fillColor: "#eab308", fillOpacity: 0.06, weight: 1.2 };
  }
  if (type === "CTR") {
    return { color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.06, weight: 1.3 };
  }
  return { color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.045, weight: 1 };
}

type Props = {
  waypoints: WaypointMeta[];
  airports: Airport[];
  showAirports: boolean;
  showAirspaces: boolean;
  onAddWaypoint: (wp: WaypointMeta) => void;
  onMoveWaypoint: (index: number, pos: LatLng) => void;
  onRemoveWaypoint: (index: number) => void;
  fitKey: number;
};

export function RouteMap({
  waypoints,
  airports,
  showAirports,
  showAirspaces,
  onAddWaypoint,
  onMoveWaypoint,
  onRemoveWaypoint,
  fitKey,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const airportsLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const airspacesLayerRef = useRef<any>(null);
  const airspacesRef = useRef<Airspace[]>([]);
  const cbRef = useRef({ onAddWaypoint, onMoveWaypoint, onRemoveWaypoint });
  cbRef.current = { onAddWaypoint, onMoveWaypoint, onRemoveWaypoint };

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
        [47.4979, 19.0402],
        7,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.createPane("airportsPane");
      const pane = map.getPane("airportsPane");
      if (pane) pane.style.zIndex = "350";
      map.createPane("airspacesPane");
      const airspacesPane = map.getPane("airspacesPane");
      if (airspacesPane) airspacesPane.style.zIndex = "340";
      airportsLayerRef.current = L.layerGroup().addTo(map);
      airspacesLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        cbRef.current.onAddWaypoint({
          label: "WP",
          lat: e.latlng.lat,
          lon: e.latlng.lng,
        });
      });
      map.on("moveend", () => renderAirports());
      mapRef.current = map;
      renderAirports();
      renderAirspaces();
      syncWaypoints();
    })();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncWaypoints() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = waypoints.map((wp, idx) => {
      const marker = L.marker([wp.lat, wp.lon], { draggable: true, autoPan: true }).addTo(map);
      marker.bindTooltip(wp.label, { direction: "top" });
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        cbRef.current.onMoveWaypoint(idx, { lat: pos.lat, lng: pos.lng });
      });
      marker.on("contextmenu", () => cbRef.current.onRemoveWaypoint(idx));
      return marker;
    });
    if (lineRef.current) map.removeLayer(lineRef.current);
    lineRef.current = null;
    if (waypoints.length > 1) {
      lineRef.current = L.polyline(
        waypoints.map((w) => [w.lat, w.lon]),
        { color: "#3b82f6", weight: 3 },
      ).addTo(map);
    }
  }

  function renderAirports() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = airportsLayerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    if (!showAirports || !airports.length) return;
    const b = map.getBounds();
    let count = 0;
    for (const ap of airports) {
      if (count >= 900) break;
      if (
        ap.lat >= b.getSouth() &&
        ap.lat <= b.getNorth() &&
        ap.lon >= b.getWest() &&
        ap.lon <= b.getEast()
      ) {
        const dot = L.circleMarker([ap.lat, ap.lon], {
          radius: 4,
          color: "#3b82f6",
          weight: 1,
          fillOpacity: 0.85,
          pane: "airportsPane",
        });
        dot.bindPopup(() => buildAirportPopup(ap, map));
        layer.addLayer(dot);
        count++;
      }
    }
  }

  function renderAirspaces() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = airspacesLayerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    if (!showAirspaces || !airspacesRef.current.length) return;

    for (const airspace of airspacesRef.current) {
      const polygon = L.polygon(airspace.points, {
        ...styleForAirspace(airspace),
        pane: "airspacesPane",
      });
      polygon.bindPopup(() => buildAirspacePopup(airspace));
      layer.addLayer(polygon);
    }
  }

  function buildAirspacePopup(airspace: Airspace) {
    const wrap = document.createElement("div");
    wrap.className = "leaflet-airspace-popup";
    const name = document.createElement("strong");
    name.textContent = airspace.name;
    const details = document.createElement("div");
    details.textContent = [
      airspace.type || `Class ${airspace.classCode}`,
      airspace.lowerLimit && airspace.upperLimit
        ? `${airspace.lowerLimit} - ${airspace.upperLimit}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const note = document.createElement("small");
    note.textContent = "Unofficial OpenAIR data. Check official publications.";
    wrap.append(name, document.createElement("br"), details, note);
    return wrap;
  }

  function buildAirportPopup(ap: Airport, map: { closePopup: () => void }) {
    const wrap = document.createElement("div");
    wrap.className = "leaflet-airport-popup";
    const code = document.createElement("strong");
    code.textContent = ap.icao;
    const name = document.createElement("div");
    name.textContent = ap.name;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Add waypoint";
    btn.className = "leaflet-airport-popup__button";
    btn.onclick = () => {
      cbRef.current.onAddWaypoint({
        label: ap.icao,
        name: ap.name,
        lat: ap.lat,
        lon: ap.lon,
      });
      map.closePopup();
    };
    wrap.append(code, document.createElement("br"), name, btn);
    return wrap;
  }

  useEffect(() => {
    syncWaypoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  useEffect(() => {
    renderAirports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airports, showAirports]);

  useEffect(() => {
    let disposed = false;
    if (!showAirspaces) {
      renderAirspaces();
      return;
    }
    if (airspacesRef.current.length) {
      renderAirspaces();
      return;
    }
    fetch("/data/airspace/hungary-openair-2026v2.txt")
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (disposed || !text) return;
        airspacesRef.current = parseOpenAir(text);
        renderAirspaces();
      })
      .catch(() => {
        /* optional overlay */
      });
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAirspaces]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || waypoints.length < 2 || !fitKey) return;
    map.fitBounds(
      L.latLngBounds(waypoints.map((w) => [w.lat, w.lon])),
      { padding: [28, 28] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export default RouteMap;
