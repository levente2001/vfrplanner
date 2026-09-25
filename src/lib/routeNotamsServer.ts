export type RouteNotamServerOptions = {
  apiKey?: string | null;
};

type RoutePoint = {
  label?: string;
  name?: string;
  lat?: number;
  lon?: number;
};

type RouteNotamRequest = {
  route?: RoutePoint[];
  corridorNm?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status === 200
          ? "private, max-age=120, stale-while-revalidate=120"
          : "no-store",
    },
  });
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactNotam(item: Record<string, unknown>) {
  const raw = textValue(item.raw);
  const body = textValue(item.body) || raw || "NOTAM";
  return {
    id:
      textValue(item.notam_id) ||
      textValue(item.notam_id_domestic) ||
      "NOTAM",
    location: textValue(item.location) || undefined,
    qCode: textValue(item.q_code) || undefined,
    traffic: textValue(item.traffic) || undefined,
    purpose: textValue(item.purpose) || undefined,
    scope: textValue(item.scope) || undefined,
    lowerLimit: textValue(item.lower_limit) || undefined,
    upperLimit: textValue(item.upper_limit) || undefined,
    effectiveStart: textValue(item.effective) || undefined,
    effectiveEnd: textValue(item.expiration) || undefined,
    text: body,
    raw,
  };
}

export async function handleRouteNotams(
  request: Request,
  options: RouteNotamServerOptions = {},
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const apiKey = options.apiKey?.trim() ?? "";
  if (!apiKey) {
    return json(
      {
        error:
          "Automatic NOTAM provider is not configured. Set SKYLINK_API_KEY once in the server/deployment environment.",
      },
      503,
    );
  }

  try {
    const payload = (await request.json()) as RouteNotamRequest;
    const route = Array.isArray(payload.route) ? payload.route : [];
    const icaos = Array.from(
      new Set(
        route
          .map((item) => textValue(item.label).toUpperCase())
          .filter((label) => /^[A-Z]{4}$/.test(label)),
      ),
    );

    if (!icaos.length) {
      return json(
        {
          error:
            "No ICAO-coded aerodrome was found in the route for automatic NOTAM lookup.",
        },
        400,
      );
    }

    const groups = await Promise.all(
      icaos.map(async (icao) => {
        const response = await fetch(
          `https://data.skylinkapi.com/v3.1/notams/${icao}?include_future=true`,
          {
            headers: {
              "x-api-key": apiKey,
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `SkyLink NOTAM ${icao} HTTP ${response.status}`,
          );
        }

        const data = (await response.json()) as Record<string, unknown>;
        const items = Array.isArray(data.notams)
          ? data.notams.filter(isRecord)
          : [];
        return items.map(compactNotam);
      }),
    );

    const deduplicated = Array.from(
      new Map(
        groups
          .flat()
          .map((item) => [
            [item.id, item.location, item.effectiveStart].join("|"),
            item,
          ]),
      ).values(),
    );

    return json({
      provider: "SkyLink API",
      coverage:
        "Automatic aerodrome/FIR notices returned for ICAO-coded route aerodromes. Verify complete en-route coverage against the official NOTAM briefing.",
      notams: deduplicated,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Automatic NOTAM request failed.",
      },
      502,
    );
  }
}
