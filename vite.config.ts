import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { adaptAviationWeather } from "./src/lib/weather/providers/aviationWeather";
import { adaptCheckWx } from "./src/lib/weather/providers/checkwx";

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

function weatherApiPlugin(apiKey: string, configuredProvider: string): Plugin {
  const cache = new Map<string, { expiresAt: number; body: string }>();
  const ttlMs = 5 * 60 * 1000;

  return {
    name: "aviation-weather-api-proxy",
    configureServer(server) {
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
