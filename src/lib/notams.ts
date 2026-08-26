import type { WaypointMeta } from "@/lib/vfr/nav";

export type NotamItem = {
  id: string;
  location?: string;
  qCode?: string;
  traffic?: string;
  purpose?: string;
  scope?: string;
  lowerLimit?: string;
  upperLimit?: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  text: string;
  raw?: string;
};

type NotamResponse = {
  notams?: unknown;
};

export type NotamRequest = {
  route: Array<{
    label: string;
    name?: string;
    lat: number;
    lon: number;
  }>;
  corridorNm: number;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNotam(item: unknown, index: number): NotamItem | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const text =
    textValue(record.text) ||
    textValue(record.message) ||
    textValue(record.raw) ||
    textValue(record.notamText);
  if (!text) return null;

  return {
    id:
      textValue(record.id) ||
      textValue(record.number) ||
      textValue(record.notamId) ||
      `NOTAM-${index + 1}`,
    location: textValue(record.location) || textValue(record.icao) || undefined,
    qCode: textValue(record.qCode) || textValue(record.qcode) || undefined,
    traffic: textValue(record.traffic) || undefined,
    purpose: textValue(record.purpose) || undefined,
    scope: textValue(record.scope) || undefined,
    lowerLimit: textValue(record.lowerLimit) || textValue(record.lower) || undefined,
    upperLimit: textValue(record.upperLimit) || textValue(record.upper) || undefined,
    effectiveStart:
      textValue(record.effectiveStart) || textValue(record.validFrom) || textValue(record.start) || undefined,
    effectiveEnd:
      textValue(record.effectiveEnd) || textValue(record.validTo) || textValue(record.end) || undefined,
    text,
    raw: textValue(record.raw) || undefined,
  };
}

function normalizeResponse(payload: unknown) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as NotamResponse | null)?.notams)
      ? (payload as { notams: unknown[] }).notams
      : [];

  return list
    .map((item, index) => normalizeNotam(item, index))
    .filter((item): item is NotamItem => Boolean(item));
}

export function parseNotamBriefing(input: string): NotamItem[] {
  const text = input.trim();
  if (!text) return [];

  const blocks = text
    .split(/\n(?=(?:[A-Z]\d{4}\/\d{2}|[A-Z]{4}\s+[A-Z]\d{4}\/\d{2}|NOTAM\s+\d+|Q\)|A\)))/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const source = blocks.length > 1 ? blocks : [text];

  return source.map((block, index) => {
    const id =
      block.match(/\b[A-Z]\d{4}\/\d{2}\b/)?.[0] ||
      block.match(/\bNOTAM\s+([A-Z0-9/-]+)\b/i)?.[1] ||
      `NOTAM-${index + 1}`;
    const location =
      block.match(/\bA\)\s*([A-Z]{4})\b/)?.[1] ||
      block.match(/^\s*([A-Z]{4})\s+[A-Z]\d{4}\/\d{2}/)?.[1];
    const effectiveStart = block.match(/\bB\)\s*([0-9]{10})\b/)?.[1];
    const effectiveEnd = block.match(/\bC\)\s*([0-9]{10}|PERM|EST)\b/)?.[1];
    const qCode = block.match(/\bQ\)\s*[^/]*\/([^/]+)/)?.[1];
    const lowerLimit = block.match(/\bF\)\s*([^\n]+)/)?.[1]?.trim();
    const upperLimit = block.match(/\bG\)\s*([^\n]+)/)?.[1]?.trim();
    const plainText = block.match(/\bE\)\s*([\s\S]*?)(?:\nF\)|\nG\)|$)/)?.[1]?.trim() || block;

    return {
      id,
      location,
      qCode,
      effectiveStart,
      effectiveEnd,
      lowerLimit,
      upperLimit,
      text: plainText,
      raw: block,
    };
  });
}

export function buildNotamRequest(waypoints: WaypointMeta[], corridorNm: number): NotamRequest {
  return {
    corridorNm,
    route: waypoints.map((waypoint) => ({
      label: waypoint.label,
      name: waypoint.name,
      lat: waypoint.lat,
      lon: waypoint.lon,
    })),
  };
}

export async function fetchRouteNotams(request: NotamRequest) {
  const response = await fetch("/api/notams", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (response.status === 404) {
    throw new Error("NOTAM backend is not connected yet. Add a /api/notams endpoint that proxies an official NOTAM source.");
  }

  if (!response.ok) {
    throw new Error(`NOTAM request failed with HTTP ${response.status}.`);
  }

  return normalizeResponse(await response.json());
}
