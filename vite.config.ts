import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { handleAirspaceUsePlan } from "./src/lib/airspaceUsePlan";
import { handleFlightLoggerAircraftDetail } from "./src/lib/flightloggerAircraftDetail";
import { handleFlightLoggerAircrafts } from "./src/lib/flightloggerAircrafts";
import { handleFlightLoggerBookings } from "./src/lib/flightloggerBookings";
import { adaptAviationWeather } from "./src/lib/weather/providers/aviationWeather";
import { adaptCheckWx } from "./src/lib/weather/providers/checkwx";

const HUNGARY_BBOX = "45.7,16.0,48.7,23.0";
const LLSIGWX_PDF_URL = "https://www.netbriefing.hu/Kepek/MET/LLSIGWX.pdf";
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

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function distanceNm(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
) {
  const radiusNm = 3440.065;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function sendFetchResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function weatherApiPlugin(apiKey: string, configuredProvider: string): Plugin {
  const cache = new Map<string, { expiresAt: number; body: string }>();
  let llsigwxCache: {
    expiresAt: number;
    body: Uint8Array;
    etag: string | null;
    lastModified: string | null;
  } | null = null;
  const ttlMs = 5 * 60 * 1000;

  return {
    name: "aviation-weather-api-proxy",
    configureServer(server) {
      server.middlewares.use("/api/bookings", async (req, res) => {
        const response = await handleFlightLoggerBookings(
          new Request(`http://localhost/api/bookings${req.url ?? ""}`, {
            method: req.method,
            headers: {
              authorization: req.headers.authorization ?? "",
              "x-flightlogger-token": String(
                req.headers["x-flightlogger-token"] ?? "",
              ),
            },
          }),
        );
        await sendFetchResponse(res, response);
      });

      server.middlewares.use("/api/aircrafts", async (req, res) => {
        const response = await handleFlightLoggerAircrafts(
          new Request(`http://localhost/api/aircrafts${req.url ?? ""}`, {
            method: req.method,
            headers: {
              authorization: req.headers.authorization ?? "",
              "x-flightlogger-token": String(
                req.headers["x-flightlogger-token"] ?? "",
              ),
            },
          }),
        );
        await sendFetchResponse(res, response);
      });

      server.middlewares.use("/api/aircraft-detail", async (req, res) => {
        const response = await handleFlightLoggerAircraftDetail(
          new Request(`http://localhost/api/aircraft-detail${req.url ?? ""}`, {
            method: req.method,
            headers: {
              authorization: req.headers.authorization ?? "",
              "x-flightlogger-token": String(
                req.headers["x-flightlogger-token"] ?? "",
              ),
            },
          }),
        );
        await sendFetchResponse(res, response);
      });

      server.middlewares.use("/api/airspace-use-plan", async (req, res) => {
        const response = await handleAirspaceUsePlan(
          new Request(`http://localhost/api/airspace-use-plan${req.url ?? ""}`, {
            method: req.method,
            headers: {
              accept: req.headers.accept ?? "application/json",
            },
          }),
        );
        await sendFetchResponse(res, response);
      });

      server.middlewares.use("/api/metar", async (req, res) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const icao = url.searchParams.get("icao")?.toUpperCase() ?? "";
        const lat = toNumber(url.searchParams.get("lat"));
        const lon = toNumber(url.searchParams.get("lon"));
        if (!/^[A-Z0-9]{4}$/.test(icao)) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Invalid ICAO code." }));
          return;
        }

        const cacheKey = `metar:${icao}:${lat ?? ""}:${lon ?? ""}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=120");
          res.end(cached.body);
          return;
        }

        try {
          const headers = {
            "User-Agent": "vfrplanner/0.1 local-development",
          };
          const params =
            lat !== null && lon !== null
              ? `bbox=${lat - 1},${lon - 1},${lat + 1},${lon + 1}`
              : `ids=${icao}`;
          const response = await fetch(
            `https://aviationweather.gov/api/data/metar?${params}&format=json`,
            { headers },
          );
          if (!response.ok)
            throw new Error(`AviationWeather METAR HTTP ${response.status}`);
          const data = await response.json();
          const observations = Array.isArray(data)
            ? data.filter(isRecord).filter((item) => item.rawOb)
            : [];
          if (!observations.length) {
            throw new Error(`No current METAR returned for ${icao}`);
          }

          const targetPosition =
            lat !== null && lon !== null ? { lat, lon } : null;
          const selected =
            targetPosition === null
              ? (observations.find((item) => item.icaoId === icao) ??
                observations[0])
              : observations
                  .map((item) => {
                    const itemLat = toNumber(item.lat);
                    const itemLon = toNumber(item.lon);
                    return {
                      item,
                      distance:
                        itemLat === null || itemLon === null
                          ? Number.POSITIVE_INFINITY
                          : distanceNm(targetPosition, {
                              lat: itemLat,
                              lon: itemLon,
                            }),
                    };
                  })
                  .sort((a, b) => a.distance - b.distance)[0]?.item;

          if (!selected)
            throw new Error(`No current METAR returned for ${icao}`);
          const selectedLat = toNumber(selected.lat);
          const selectedLon = toNumber(selected.lon);
          const selectedDistance =
            targetPosition && selectedLat !== null && selectedLon !== null
              ? distanceNm(targetPosition, {
                  lat: selectedLat,
                  lon: selectedLon,
                })
              : null;
          const body = JSON.stringify({
            station:
              typeof selected.icaoId === "string" ? selected.icaoId : icao,
            distanceNm:
              selectedDistance === null
                ? null
                : Math.round(selectedDistance * 10) / 10,
            observation: selected,
            source: "NOAA/NWS Aviation Weather Center",
          });
          cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, body });
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=120");
          res.end(body);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "METAR request failed.",
            }),
          );
        }
      });

      server.middlewares.use("/api/weather/llsigwx.pdf", async (_req, res) => {
        if (llsigwxCache && llsigwxCache.expiresAt > Date.now()) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/pdf");
          res.setHeader("cache-control", "private, max-age=300");
          res.setHeader(
            "content-disposition",
            'inline; filename="LLSIGWX.pdf"',
          );
          if (llsigwxCache.etag) res.setHeader("etag", llsigwxCache.etag);
          if (llsigwxCache.lastModified) {
            res.setHeader("last-modified", llsigwxCache.lastModified);
          }
          res.end(llsigwxCache.body);
          return;
        }

        try {
          const response = await fetch(LLSIGWX_PDF_URL, {
            headers: {
              "User-Agent": "vfrplanner/0.1 local-development",
              Accept: "application/pdf",
            },
          });
          if (!response.ok) throw new Error(`LLSIGWX HTTP ${response.status}`);
          const body = new Uint8Array(await response.arrayBuffer());
          llsigwxCache = {
            expiresAt: Date.now() + ttlMs,
            body,
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
          };
          res.statusCode = 200;
          res.setHeader("content-type", "application/pdf");
          res.setHeader("cache-control", "private, max-age=300");
          res.setHeader(
            "content-disposition",
            'inline; filename="LLSIGWX.pdf"',
          );
          if (llsigwxCache.etag) res.setHeader("etag", llsigwxCache.etag);
          if (llsigwxCache.lastModified) {
            res.setHeader("last-modified", llsigwxCache.lastModified);
          }
          res.end(body);
        } catch {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "LLSIGWX chart request failed." }));
        }
      });

      server.middlewares.use("/api/weather/stations", async (_req, res) => {
        const provider =
          configuredProvider === "checkwx" ? "checkwx" : "aviationweather";
        const key = `stations:${provider}`;
        const cached = cache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=300");
          res.end(cached.body);
          return;
        }

        try {
          let body: string;
          if (provider === "checkwx") {
            if (!apiKey) throw new Error("CHECKWX_API_KEY is not configured.");
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
                const [metar, taf] = await Promise.all([
                  metarResponse.json(),
                  tafResponse.json(),
                ]);
                return { icao, metar, taf };
              }),
            );
            body = JSON.stringify({
              provider,
              stations: adaptCheckWx(items),
              generatedAt: new Date().toISOString(),
            });
          } else {
            const headers = {
              "User-Agent": "vfrplanner/0.1 local-development",
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
            if (!metarResponse.ok)
              throw new Error(
                `AviationWeather METAR HTTP ${metarResponse.status}`,
              );
            if (!tafResponse.ok)
              throw new Error(`AviationWeather TAF HTTP ${tafResponse.status}`);
            const [metars, tafs] = await Promise.all([
              metarResponse.json(),
              tafResponse.json(),
            ]);
            body = JSON.stringify({
              provider,
              stations: adaptAviationWeather(metars, tafs),
              generatedAt: new Date().toISOString(),
            });
          }
          cache.set(key, { expiresAt: Date.now() + ttlMs, body });
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=300");
          res.end(body);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Weather request failed.",
            }),
          );
        }
      });

      server.middlewares.use("/api/rainviewer", async (_req, res) => {
        const cached = cache.get("rainviewer");
        if (cached && cached.expiresAt > Date.now()) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(cached.body);
          return;
        }
        try {
          const response = await fetch(
            "https://api.rainviewer.com/public/weather-maps.json",
          );
          if (!response.ok)
            throw new Error(`RainViewer HTTP ${response.status}`);
          const body = await response.text();
          cache.set("rainviewer", { expiresAt: Date.now() + ttlMs, body });
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=300");
          res.end(body);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "RainViewer request failed.",
            }),
          );
        }
      });

      server.middlewares.use("/api/checkwx", async (req, res) => {
        const icao =
          req.url?.replace(/^\/+/, "").split("?")[0]?.toUpperCase() ?? "";
        if (!/^[A-Z0-9]{4}$/.test(icao)) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Invalid ICAO code." }));
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({ error: "CHECKWX_API_KEY is not configured." }),
          );
          return;
        }

        const cached = cache.get(icao);
        if (cached && cached.expiresAt > Date.now()) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=120");
          res.end(cached.body);
          return;
        }

        try {
          const headers = { "X-API-Key": apiKey };
          const [metarResponse, tafResponse] = await Promise.all([
            fetch(`https://api.checkwx.com/v2/metar/${icao}/decoded`, {
              headers,
            }),
            fetch(`https://api.checkwx.com/v2/taf/${icao}/decoded`, {
              headers,
            }),
          ]);
          const [metar, taf] = await Promise.all([
            metarResponse.json(),
            tafResponse.json(),
          ]);
          const body = JSON.stringify({
            metarStatus: metarResponse.status,
            tafStatus: tafResponse.status,
            metar,
            taf,
          });

          cache.set(icao, { expiresAt: Date.now() + ttlMs, body });
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "private, max-age=120");
          res.end(body);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "CheckWX request failed.",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      weatherApiPlugin(env.CHECKWX_API_KEY, env.AVIATION_WEATHER_PROVIDER),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
