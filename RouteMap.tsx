import { useEffect, useRef } from "react";
import polygonClipping, { type Polygon } from "polygon-clipping";
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
  showCorridor: boolean;
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
  showCorridor,
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
  const corridorLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const corridorStateRef = useRef({ waypoints, showCorridor });
  corridorStateRef.current = { waypoints, showCorridor };
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
      const corridorPane = map.createPane("corridorPane");
      corridorPane.style.zIndex = "330";
      corridorPane.style.pointerEvents = "none";
      corridorLayerRef.current = L.layerGroup().addTo(map);
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
      renderCorridor();
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

  function renderCorridor() {
    const L = LRef.current;
    const layer = corridorLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    const { waypoints: points, showCorridor: visible } = corridorStateRef.current;
    if (!visible) return;
    const polygons: Polygon[] = [];
    const roundedPoints = new Set<WaypointMeta>();
    const distance = (5 * 1852) / 6371000;
    function offset(lat: number, lon: number, bearing: number): [number, number] {
      const offsetLat = Math.asin(Math.sin(lat) * Math.cos(distance)
        + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
      const offsetLon = lon + Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
        Math.cos(distance) - Math.sin(lat) * Math.sin(offsetLat),
      );
      return [offsetLat * 180 / Math.PI, offsetLon * 180 / Math.PI];
    }
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      if (from.lat === to.lat && from.lon === to.lon) continue;
      roundedPoints.add(from);
      roundedPoints.add(to);
      // Sample the same Mercator segment Leaflet draws. Offset each sample by
      // 5 NM on the sphere, so the width stays geographic at every zoom level.
      const a = L.CRS.EPSG3857.project(L.latLng(from.lat, from.lon));
      const b = L.CRS.EPSG3857.project(L.latLng(to.lat, to.lon));
      const heading = Math.atan2(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10000));
      const left: [number, number][] = [];
      const right: [number, number][] = [];
      for (let step = 0; step <= steps; step++) {
        const fraction = step / steps;
        const point = L.CRS.EPSG3857.unproject(L.point(
          a.x + (b.x - a.x) * fraction,
          a.y + (b.y - a.y) * fraction,
        ));
        const lat = point.lat * Math.PI / 180;
        const lon = point.lng * Math.PI / 180;
        for (const [side, edge] of [[-1, left], [1, right]] as const) {
          const bearing = heading + side * Math.PI / 2;
          edge.push(offset(lat, lon, bearing));
        }
      }
      polygons.push([[...left, ...right.reverse(), left[0]]]);
    }
    // Round the ends and joins, then dissolve all overlaps into one geometry.
    for (const point of roundedPoints) {
      const ring = Array.from({ length: 180 }, (_, index) => offset(
        point.lat * Math.PI / 180,
        point.lon * Math.PI / 180,
        index * 2 * Math.PI / 180,
      ));
      ring.push(ring[0]);
      polygons.push([ring]);
    }
    if (polygons.length) {
      const merged = polygonClipping.union(polygons[0], ...polygons.slice(1));
      layer.addLayer(L.polygon(merged, {
        pane: "corridorPane",
        color: "#3b82f6",
        fillOpacity: 0.1,
        opacity: 0.3,
        weight: 1,
        interactive: false,
      }));
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
    renderCorridor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, showCorridor]);

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
