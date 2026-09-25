import { requestFromEvent, responseToEvent } from "./_request";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { expiresAt: number; body: string } | null = null;

export default async function handle(request: Request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  }

  if (cached && cached.expiresAt > Date.now()) {
    return jsonText(cached.body, 200, {
      "Cache-Control": "private, max-age=300",
    });
  }

  try {
    const response = await fetch(
      "https://api.rainviewer.com/public/weather-maps.json",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "vfrplanner/0.1 production",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`RainViewer HTTP ${response.status}`);
    }

    const body = await response.text();
    cached = { expiresAt: Date.now() + CACHE_TTL_MS, body };

    return jsonText(body, 200, {
      "Cache-Control": "private, max-age=300",
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "RainViewer request failed.",
      },
      502,
    );
  }
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handle(requestFromEvent(event, "/api/rainviewer")),
  );
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
