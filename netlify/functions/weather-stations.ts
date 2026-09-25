import { adaptAviationWeather } from "../../src/lib/weather/providers/aviationWeather";
import { adaptCheckWx } from "../../src/lib/weather/providers/checkwx";
import { requestFromEvent, responseToEvent } from "./_request";

const HUNGARY_BBOX = "45.7,16.0,48.7,23.0";
const CHECKWX_STATIONS = [
  "LHBP",
  "LHDC",
  "LHSM",
  "LHPA",
  "LHPR",
  "LHPP",
  "LHKE",
  "LHSN",
  "LHNY",
];
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { expiresAt: number; body: string } | null = null;

export default async function handle(request: Request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  }

  const provider =
    runtimeEnv().AVIATION_WEATHER_PROVIDER === "checkwx"
      ? "checkwx"
      : "aviationweather";
  const cacheKey = provider;

  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.body.includes(cacheKey)
  ) {
    return jsonText(cached.body, 200, {
      "Cache-Control": "private, max-age=300",
    });
  }

  try {
    const body =
      provider === "checkwx"
        ? await fetchCheckWxStations()
        : await fetchAviationWeatherStations();

    cached = { expiresAt: Date.now() + CACHE_TTL_MS, body };

    return jsonText(body, 200, {
      "Cache-Control": "private, max-age=300",
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Weather request failed.",
      },
      502,
    );
  }
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handle(requestFromEvent(event, "/api/weather/stations")),
  );
}

async function fetchAviationWeatherStations() {
  const headers = {
    Accept: "application/json",
    "User-Agent": "vfrplanner/0.1 production",
  };

  const [metarResponse, tafResponse] = await Promise.all([
    fetch(
      `https://aviationweather.gov/api/data/metar?bbox=${HUNGARY_BBOX}&format=json`,
      { headers },
    ),
    fetch(
      `https://aviationweather.gov/api/data/taf?bbox=${HUNGARY_BBOX}&format=json`,
      { headers },
    ),
  ]);

  if (!metarResponse.ok) {
    throw new Error(`AviationWeather METAR HTTP ${metarResponse.status}`);
  }
  if (!tafResponse.ok) {
    throw new Error(`AviationWeather TAF HTTP ${tafResponse.status}`);
  }

  const [metars, tafs] = await Promise.all([
    metarResponse.json(),
    tafResponse.json(),
  ]);

  return JSON.stringify({
    provider: "aviationweather",
    stations: adaptAviationWeather(metars, tafs),
    generatedAt: new Date().toISOString(),
  });
}

async function fetchCheckWxStations() {
  const apiKey = runtimeEnv().CHECKWX_API_KEY ?? "";

  if (!apiKey) {
    throw new Error("CHECKWX_API_KEY is not configured.");
  }

  const headers = { "X-API-Key": apiKey };
  const items = await Promise.all(
    CHECKWX_STATIONS.map(async (icao) => {
      const [metarResponse, tafResponse] = await Promise.all([
        fetch(`https://api.checkwx.com/v2/metar/${icao}/decoded`, {
          headers,
        }),
        fetch(`https://api.checkwx.com/v2/taf/${icao}/decoded`, {
          headers,
        }),
      ]);

      if (!metarResponse.ok) {
        throw new Error(`CheckWX METAR ${icao} HTTP ${metarResponse.status}`);
      }
      if (!tafResponse.ok) {
        throw new Error(`CheckWX TAF ${icao} HTTP ${tafResponse.status}`);
      }

      const [metar, taf] = await Promise.all([
        metarResponse.json(),
        tafResponse.json(),
      ]);

      return { icao, metar, taf };
    }),
  );

  return JSON.stringify({
    provider: "checkwx",
    stations: adaptCheckWx(items),
    generatedAt: new Date().toISOString(),
  });
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return jsonText(JSON.stringify(body), status, headers);
}

function jsonText(body: string, status = 200, headers?: HeadersInit) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function runtimeEnv() {
  return (
    (
      globalThis as unknown as {
        process?: {
          env?: Record<string, string | undefined>;
        };
      }
    ).process?.env ?? {}
  );
}
