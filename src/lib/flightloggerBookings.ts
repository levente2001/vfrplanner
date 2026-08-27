import { normalizeBookings } from "../flightlogger/shared/bookingNormalizer";
import { BOOKINGS_QUERY } from "../flightlogger/shared/flightloggerQuery";
import {
  BOOKING_STATUSES,
  BOOKING_SUBTYPES,
  type BookingsApiResponse,
} from "../flightlogger/shared/types";

const DEFAULT_ENDPOINT = "https://api.flightlogger.net/graphql";
const MAX_BOOKINGS = 1000;
const PAGE_SIZE = 40;
const MAX_PAGES = Math.ceil(MAX_BOOKINGS / PAGE_SIZE);

let lastSuccessfulResponse: BookingsApiResponse | null = null;

type GraphQlEdge = {
  cursor?: string;
  node?: unknown;
};

type GraphQlPage = {
  bookings?: {
    edges?: GraphQlEdge[];
    pageInfo?: {
      endCursor?: string | null;
      hasNextPage?: boolean;
    };
  };
};

export async function handleFlightLoggerBookings(request: Request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  }

  try {
    const params = parseQuery(new URL(request.url).searchParams);
    const response = await fetchAllBookings(params, tokenFromRequest(request));
    lastSuccessfulResponse = response;
    return json(response, 200, {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load bookings.";
    if (lastSuccessfulResponse) {
      return json({ ...lastSuccessfulResponse, cached: true });
    }
    return json(
      {
        error: friendlyError(message),
        detail:
          runtimeEnv().NODE_ENV === "production"
            ? undefined
            : sanitizeErrorDetail(message),
      },
      statusForError(message),
    );
  }
}

async function fetchAllBookings(
  params: ReturnType<typeof parseQuery>,
  requestToken: string | null,
): Promise<BookingsApiResponse> {
  const env = runtimeEnv();
  const token = requestToken || env.FLIGHTLOGGER_API_TOKEN || env.API_KEY;
  const endpoint = env.FLIGHTLOGGER_API_URL || DEFAULT_ENDPOINT;
  if (!token) throw new Error("FLIGHTLOGGER_API_TOKEN is required.");

  const allNodes: unknown[] = [];
  let cursor: string | undefined = params.pageCursor;
  let hasNextPage = true;
  let page = 0;
  let endCursor: string | null | undefined = cursor;

  while (hasNextPage && page < MAX_PAGES) {
    const data = await requestFlightLogger<GraphQlPage>(endpoint, token, {
      from: params.from,
      to: params.to,
      changedAfter: params.changedAfter,
      all: false,
      subtypes: params.subtypes.length ? params.subtypes : undefined,
      statuses: params.statuses.length ? params.statuses : undefined,
      overlap: true,
      after: cursor,
      before: undefined,
      first: PAGE_SIZE,
      last: undefined,
    });

    const edges = data.bookings?.edges ?? [];
    allNodes.push(...edges.map((edge) => edge.node).filter(Boolean));
    endCursor = data.bookings?.pageInfo?.endCursor;
    hasNextPage = Boolean(data.bookings?.pageInfo?.hasNextPage && endCursor);
    cursor = endCursor ?? undefined;
    page += 1;
  }

  let bookings = normalizeBookings(allNodes);
  if (params.search) {
    bookings = bookings.filter((booking) =>
      bookingMatchesSearch(booking, params.search),
    );
  }

  return {
    bookings,
    pageInfo: {
      endCursor,
      hasNextPage,
    },
    fetchedPages: page,
    total: bookings.length,
  };
}

async function requestFlightLogger<T>(
  endpoint: string,
  token: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: BOOKINGS_QUERY,
      variables,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok || payload?.errors?.length) {
    const message = payload?.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    const tokenKind = await detectTokenKind(endpoint, token);
    if (tokenKind === "myFlightLogger") {
      throw new Error(
        "The configured token is a my|FlightLogger API key. The FlightLogger root bookings query requires an account-specific API key with bookings access.",
      );
    }
    throw new Error(
      message || `FlightLogger request failed with ${response.status}.`,
    );
  }

  if (!payload?.data)
    throw new Error("FlightLogger returned an empty response.");
  return payload.data;
}

function parseQuery(query: URLSearchParams) {
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  if (!isIsoDate(from)) throw new Error("A valid from date is required.");
  if (!isIsoDate(to)) throw new Error("A valid to date is required.");

  const statuses = readCsv(query.get("statuses")).filter((value) =>
    BOOKING_STATUSES.includes(value as (typeof BOOKING_STATUSES)[number]),
  );
  const subtypes = readCsv(query.get("subtypes")).filter((value) =>
    BOOKING_SUBTYPES.includes(value as (typeof BOOKING_SUBTYPES)[number]),
  );
  const changedAfter = query.get("changedAfter") ?? "";

  if (changedAfter && !isIsoDate(changedAfter)) {
    throw new Error("changedAfter must be a valid ISO date.");
  }

  return {
    from,
    to,
    statuses,
    subtypes,
    search: (query.get("search") ?? "").trim().toLowerCase(),
    changedAfter: changedAfter || undefined,
    pageCursor: query.get("pageCursor") || undefined,
  };
}

function bookingMatchesSearch(
  booking: { [key: string]: unknown },
  search: string,
) {
  const haystack = [
    booking.title,
    booking.description,
    booking.instructor,
    booking.classroom,
    booking.aircraft,
    booking.subtype,
    booking.status,
    ...(Array.isArray(booking.participants) ? booking.participants : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function readCsv(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isIsoDate(value: string): boolean {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

async function detectTokenKind(
  endpoint: string,
  token: string,
): Promise<"myFlightLogger" | "account" | "unknown"> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query:
        "query TokenKind { myFlightLogger { email } account { subdomain } }",
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: { myFlightLogger?: unknown; account?: unknown };
    errors?: Array<{ message?: string }>;
  } | null;

  if (payload?.data?.account) return "account";
  if (payload?.data?.myFlightLogger) return "myFlightLogger";
  if (
    payload?.errors?.some((error) =>
      error.message?.includes("my|FlightLogger API key"),
    )
  ) {
    return "myFlightLogger";
  }
  return response.ok ? "unknown" : "unknown";
}

function statusForError(message: string): number {
  if (message.includes("required")) return 400;
  if (message.includes("my|FlightLogger API key")) return 403;
  return 500;
}

function friendlyError(message: string): string {
  if (message.includes("FLIGHTLOGGER_API_TOKEN")) {
    return "FlightLogger API token is required. Add your own token in the FlightLogger Calendar panel.";
  }
  if (message.includes("my|FlightLogger API key")) {
    return "This token looks like a my|FlightLogger API key. Use an account-specific FlightLogger API key with bookings access for the bookings calendar.";
  }
  return "Unable to load FlightLogger bookings. Check the token, date range, and filters.";
}

function sanitizeErrorDetail(message: string): string {
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

function tokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-flightlogger-token")?.trim() || null;
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
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
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env ?? {}
  );
}
