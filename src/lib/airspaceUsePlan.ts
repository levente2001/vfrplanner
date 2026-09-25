export type AirspaceUsePlanType = "MCTR/MTMA" | "TRA" | "DA" | "AR" | "TA" | "UNKNOWN";

export type AirspaceUsePlanArea = {
  id: string;
  type: AirspaceUsePlanType;
  designator: string;
  lowerLimit: string;
  upperLimit: string;
  lowerFt: number;
  upperFt: number;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  points: Array<[number, number]>;
};

export type AirspaceUsePlanResponse = {
  source: string;
  date: string;
  generatedAt: string;
  areas: AirspaceUsePlanArea[];
};

const AIS_MAP_URL = "https://ais.hungarocontrol.hu/terkep";
const USER_AGENT = "vfrplanner/0.1 airspace-use-plan";

type RawAsupArea = {
  type?: string;
  designator?: string;
  lower_limit?: string;
  upper_limit?: string;
  start?: string;
  end?: string;
  boundary?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? "public, s-maxage=300, stale-while-revalidate=900"
          : "no-store",
    },
  });
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayUtc();
}

function parseTime(value: string | undefined, fallback: number) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

function altitudeFeet(value: string | undefined, fallback: number) {
  const clean = (value ?? "").trim().toUpperCase();
  if (!clean || clean === "GND" || clean === "SFC") return fallback;

  const fl = clean.match(/FL\s*(\d+)/);
  if (fl) return Number(fl[1]) * 100;

  const meters = clean.match(/(\d+(?:\.\d+)?)\s*M\b/);
  if (meters) return Math.round(Number(meters[1]) * 3.28084);

  const feet = clean.match(/(\d+(?:\.\d+)?)\s*(?:FT|FEET|FOOT)\b/);
  if (feet) return Math.round(Number(feet[1]));

  const numeric = Number(clean.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseCompactDms(value: string): [number, number] | null {
  const match = value
    .trim()
    .match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])\s+(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])$/i);
  if (!match) return null;

  const lat =
    Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
  const lon =
    Number(match[5]) + Number(match[6]) / 60 + Number(match[7]) / 3600;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [
    match[4]!.toUpperCase() === "S" ? -lat : lat,
    match[8]!.toUpperCase() === "W" ? -lon : lon,
  ];
}

function htmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

export function parseBoundary(value: string | undefined) {
  return htmlText(value ?? "")
    .split(/\r?\n/)
    .map((line) => parseCompactDms(line))
    .filter((point): point is [number, number] => Boolean(point));
}

function normalizeType(value: string | undefined): AirspaceUsePlanType {
  const clean = (value ?? "").trim().toUpperCase();
  if (clean === "MCTR/MTMA") return "MCTR/MTMA";
  if (clean === "TRA") return "TRA";
  if (clean === "DA") return "DA";
  if (clean === "AR") return "AR";
  if (clean === "TA") return "TA";
  return "UNKNOWN";
}

function extractAsupData(html: string): RawAsupArea[] {
  const match = html.match(/window\.ASUPData\s*=\s*(\[[\s\S]*?\]);/);
  if (!match?.[1]) throw new Error("HungaroControl ASUP data was not found.");
  const parsed = JSON.parse(match[1]) as unknown;
  if (!Array.isArray(parsed)) throw new Error("HungaroControl ASUP data has an invalid shape.");
  return parsed as RawAsupArea[];
}

function normalizeArea(raw: RawAsupArea, index: number): AirspaceUsePlanArea | null {
  const points = parseBoundary(raw.boundary);
  if (points.length < 3) return null;

  const startMinutes = parseTime(raw.start, 0);
  const endMinutes = parseTime(raw.end, 1439);
  const lowerLimit = (raw.lower_limit ?? "").trim() || "GND";
  const upperLimit = (raw.upper_limit ?? "").trim() || "UNL";
  const designator =
    (raw.designator ?? "").trim().replace(/\s+/g, " ") || `Airspace ${index + 1}`;

  return {
    id: `${index}-${designator}`,
    type: normalizeType(raw.type),
    designator,
    lowerLimit,
    upperLimit,
    lowerFt: altitudeFeet(lowerLimit, 0),
    upperFt: altitudeFeet(upperLimit, 60000),
    start: raw.start?.trim() || "00:00",
    end: raw.end?.trim() || "23:59",
    startMinutes,
    endMinutes,
    points,
  };
}

export async function handleAirspaceUsePlan(request: Request) {
  try {
    const url = new URL(request.url);
    const date = validDate(url.searchParams.get("date"));
    const upstream = new URL(AIS_MAP_URL);
    upstream.searchParams.set("date", date);

    const response = await fetch(upstream, {
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HungaroControl AIS HTTP ${response.status}`);
    }

    const rawAreas = extractAsupData(await response.text());
    const areas = rawAreas
      .map(normalizeArea)
      .filter((area): area is AirspaceUsePlanArea => Boolean(area));

    return json({
      source: upstream.toString(),
      date,
      generatedAt: new Date().toISOString(),
      areas,
    } satisfies AirspaceUsePlanResponse);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Airspace use plan request failed.",
      },
      502,
    );
  }
}
