import { adaptAviationWeather } from "../../src/lib/weather/providers/aviationWeather";

const HUNGARY_BBOX = "45.7,16.0,48.7,23.0";
const USER_AGENT = "vfrplanner/0.1 aviation-weather-client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? "public, s-maxage=300, stale-while-revalidate=300"
          : "no-store",
    },
  });
}

export default async function handler() {
  try {
    const headers = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
    const [metarResponse, tafResponse] = await Promise.all([
      fetch(
        `https://aviationweather.gov/api/data/metar?bbox=${HUNGARY_BBOX}&format=json`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `https://aviationweather.gov/api/data/taf?bbox=${HUNGARY_BBOX}&format=json`,
        { headers, cache: "no-store" },
      ),
    ]);

    if (!metarResponse.ok) {
      throw new Error(
        `AviationWeather METAR HTTP ${metarResponse.status}`,
      );
    }
    if (!tafResponse.ok) {
      throw new Error(`AviationWeather TAF HTTP ${tafResponse.status}`);
    }

    const [metars, tafs] = await Promise.all([
      metarResponse.json(),
      tafResponse.json(),
    ]);

    return json({
      provider: "aviationweather",
      stations: adaptAviationWeather(metars, tafs),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Weather station request failed.",
      },
      502,
    );
  }
}
