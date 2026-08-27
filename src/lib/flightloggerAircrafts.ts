import {
  AIRCRAFT_QUERY,
  BASIC_AIRCRAFT_QUERY,
} from "../flightlogger/shared/aircraftQuery";
import { BOOKINGS_QUERY } from "../flightlogger/shared/flightloggerQuery";
import type {
  AircraftApiResponse,
  FlightLoggerAircraft,
} from "../flightlogger/shared/aircraftTypes";

const DEFAULT_ENDPOINT = "https://api.flightlogger.net/graphql";
const PAGE_SIZE = 25;
const BOOKING_PAGE_SIZE = 40;
const MAX_PAGES = 50;
const MIN_PAGE_SIZE = 1;

let lastSuccessfulResponse: AircraftApiResponse | null = null;

type AircraftConnection = {
  aircraft?: {
    nodes?: unknown[];
    pageInfo?: {
      endCursor?: string | null;
      hasNextPage?: boolean;
    };
  };
};

type BookingEdge = {
  node?: unknown;
};

type BookingConnection = {
  bookings?: {
    edges?: BookingEdge[];
    pageInfo?: {
      endCursor?: string | null;
      hasNextPage?: boolean;
    };
  };
};

export async function handleFlightLoggerAircrafts(request: Request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  }

  try {
    const url = new URL(request.url);

    const callSigns = readCsv(url.searchParams.get("callSigns")).map((value) =>
      value.toUpperCase(),
    );

    const aircraftClass = (
      url.searchParams.get("aircraftclass") ??
      url.searchParams.get("aircraftClass") ??
      ""
    )
      .trim()
      .toUpperCase();

    const response = await fetchAllAircraft(tokenFromRequest(request), {
      callSigns,
      aircraftClass: aircraftClass || null,
    });

    lastSuccessfulResponse = response;

    return json(response, 200, {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load aircraft.";

    if (lastSuccessfulResponse) {
      return json({
        ...lastSuccessfulResponse,
        cached: true,
      });
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

async function fetchAllAircraft(
  requestToken: string | null,
  options: {
    callSigns: string[];
    aircraftClass: string | null;
  },
): Promise<AircraftApiResponse> {
  const env = runtimeEnv();

  const token =
    requestToken ||
    env.FLIGHTLOGGER_API_TOKEN ||
    env.API_KEY;

  const endpoint =
    env.FLIGHTLOGGER_API_URL ||
    DEFAULT_ENDPOINT;

  if (!token) {
    throw new Error(
      "FLIGHTLOGGER_API_TOKEN is required.",
    );
  }

  const allNodes: unknown[] = [];

  let cursor: string | undefined;
  let endCursor: string | null | undefined;
  let hasNextPage = true;
  let page = 0;

  let query = AIRCRAFT_QUERY;
  let pageSize = PAGE_SIZE;

  let partial = false;
  let warning: string | undefined;

  while (hasNextPage && page < MAX_PAGES) {
    const variables = {
      after: cursor,
      first: pageSize,
      callSigns:
        options.callSigns.length
          ? options.callSigns
          : undefined,
    };

    let data: AircraftConnection;

    try {
      data =
        await requestFlightLogger<AircraftConnection>(
          endpoint,
          token,
          variables,
          query,
        );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load aircraft.";

      /*
       * FlightLogger calculates GraphQL query
       * complexity before executing the query.
       *
       * If the request is too expensive, reduce
       * the number of aircraft requested per page
       * and retry exactly the same page.
       */
      if (isComplexityError(message)) {
        if (pageSize > MIN_PAGE_SIZE) {
          pageSize = Math.max(
            MIN_PAGE_SIZE,
            Math.floor(pageSize / 2),
          );

          warning =
            `FlightLogger query complexity required smaller pages. ` +
            `Aircraft are being loaded in batches of ${pageSize}.`;

          continue;
        }

        /*
         * If even first: 1 is too complex using
         * the detailed query, fall back to the
         * lightweight/basic aircraft query.
         */
        if (
          query !== BASIC_AIRCRAFT_QUERY &&
          page === 0
        ) {
          query = BASIC_AIRCRAFT_QUERY;
          pageSize = PAGE_SIZE;
          partial = true;

          warning =
            "Detailed aircraft fields exceed the FlightLogger GraphQL complexity limit, so the basic aircraft list is being used.";

          continue;
        }

        throw error;
      }

      /*
       * If detailed aircraft fields are not allowed
       * for the current account/token, switch to the
       * basic query.
       */
      if (
        isPermissionError(message) &&
        query !== BASIC_AIRCRAFT_QUERY &&
        page === 0
      ) {
        query = BASIC_AIRCRAFT_QUERY;
        pageSize = PAGE_SIZE;
        partial = true;

        warning =
          "Only the basic aircraft list could be loaded. This API token does not have permission for one or more detailed aircraft fields.";

        continue;
      }

      /*
       * If the basic root aircraft query is also
       * forbidden, attempt to derive aircraft from
       * bookings.
       */
      if (
        isPermissionError(message) &&
        query === BASIC_AIRCRAFT_QUERY &&
        page === 0
      ) {
        return fetchAircraftFromBookings(
          endpoint,
          token,
          options,
        );
      }

      throw error;
    }

    const nodes =
      data.aircraft?.nodes ?? [];

    allNodes.push(...nodes);

    endCursor =
      data.aircraft?.pageInfo?.endCursor;

    hasNextPage = Boolean(
      data.aircraft?.pageInfo?.hasNextPage &&
        endCursor,
    );

    cursor =
      endCursor ?? undefined;

    page += 1;
  }

  const normalized = allNodes
    .map(normalizeAircraft)
    .filter(
      (
        item,
      ): item is FlightLoggerAircraft =>
        item !== null,
    );

  const aircraft = filterAircraft(
    normalized,
    options,
  );

  if (
    hasNextPage &&
    page >= MAX_PAGES
  ) {
    partial = true;

    warning = warning
      ? `${warning} The response also reached the ${MAX_PAGES}-page safety limit.`
      : `The response reached the ${MAX_PAGES}-page safety limit, so additional aircraft may exist.`;
  }

  return {
    aircraft,
    pageInfo: {
      endCursor,
      hasNextPage,
    },
    fetchedPages: page,
    total: aircraft.length,
    partial,
    warning,
  };
}

async function fetchAircraftFromBookings(
  endpoint: string,
  token: string,
  options: {
    callSigns: string[];
    aircraftClass: string | null;
  },
): Promise<AircraftApiResponse> {
  const seen =
    new Map<string, FlightLoggerAircraft>();

  let cursor: string | undefined;
  let endCursor:
    | string
    | null
    | undefined;

  let hasNextPage = true;
  let page = 0;

  const now = new Date();

  const from = new Date(
    Date.UTC(
      now.getUTCFullYear() - 1,
      0,
      1,
    ),
  );

  const to = new Date(
    Date.UTC(
      now.getUTCFullYear() + 2,
      0,
      1,
    ),
  );

  while (
    hasNextPage &&
    page < MAX_PAGES
  ) {
    const data =
      await requestFlightLogger<BookingConnection>(
        endpoint,
        token,
        {
          from: from.toISOString(),
          to: to.toISOString(),
          changedAfter: undefined,
          all: false,
          subtypes: undefined,
          statuses: undefined,
          overlap: true,
          after: cursor,
          before: undefined,
          first: BOOKING_PAGE_SIZE,
          last: undefined,
        },
        BOOKINGS_QUERY,
      );

    const edges =
      data.bookings?.edges ?? [];

    for (const edge of edges) {
      collectAircraft(
        edge.node,
        seen,
      );
    }

    endCursor =
      data.bookings?.pageInfo
        ?.endCursor;

    hasNextPage = Boolean(
      data.bookings?.pageInfo
        ?.hasNextPage &&
        endCursor,
    );

    cursor =
      endCursor ?? undefined;

    page += 1;
  }

  const aircraft = filterAircraft(
    Array.from(
      seen.values(),
    ).sort((a, b) =>
      a.callSign.localeCompare(
        b.callSign,
      ),
    ),
    options,
  );

  return {
    aircraft,
    pageInfo: {
      endCursor,
      hasNextPage,
    },
    fetchedPages: page,
    total: aircraft.length,
    partial: true,
    warning:
      "The aircraft root query is not permitted for this token, so this list was derived from FlightLogger bookings. Aircraft without bookings in the current window may be missing.",
  };
}

async function requestFlightLogger<T>(
  endpoint: string,
  token: string,
  variables: Record<
    string,
    unknown
  >,
  query: string,
): Promise<T> {
  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
        authorization:
          `Bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    },
  );

  const payload =
    (await response
      .json()
      .catch(
        () => null,
      )) as {
      data?: T;
      errors?: Array<{
        message?: string;
      }>;
    } | null;

  if (
    !response.ok ||
    payload?.errors?.length
  ) {
    const message =
      payload?.errors
        ?.map(
          (error) =>
            error.message,
        )
        .filter(Boolean)
        .join("; ");

    const resolvedMessage =
      message ||
      `FlightLogger aircraft request failed with ${response.status}.`;

    /*
     * Complexity errors have nothing to do
     * with authentication.
     *
     * Do not execute an extra token-detection
     * query in this case. Let the caller lower
     * the page size and retry.
     */
    if (
      isComplexityError(
        resolvedMessage,
      )
    ) {
      throw new Error(
        resolvedMessage,
      );
    }

    const tokenKind =
      await detectTokenKind(
        endpoint,
        token,
      );

    if (
      tokenKind ===
      "myFlightLogger"
    ) {
      throw new Error(
        "The configured token is a my|FlightLogger API key. The FlightLogger aircraft query requires an account-specific API key with aircraft or bookings access.",
      );
    }

    throw new Error(
      resolvedMessage,
    );
  }

  if (!payload?.data) {
    throw new Error(
      "FlightLogger returned an empty response.",
    );
  }

  return payload.data;
}

function isPermissionError(
  message: string,
) {
  return /permission|not allowed|not authorized|access|forbidden/i.test(
    message,
  );
}

function isComplexityError(
  message: string,
) {
  return /complexity|exceeds max complexity|query is too complex/i.test(
    message,
  );
}

async function detectTokenKind(
  endpoint: string,
  token: string,
): Promise<
  | "myFlightLogger"
  | "account"
  | "unknown"
> {
  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
        authorization:
          `Bearer ${token}`,
      },
      body: JSON.stringify({
        query:
          "query TokenKind { myFlightLogger { email } account { subdomain } }",
      }),
    },
  );

  const payload =
    (await response
      .json()
      .catch(
        () => null,
      )) as {
      data?: {
        myFlightLogger?: unknown;
        account?: unknown;
      };
      errors?: Array<{
        message?: string;
      }>;
    } | null;

  if (
    payload?.data?.account
  ) {
    return "account";
  }

  if (
    payload?.data
      ?.myFlightLogger
  ) {
    return "myFlightLogger";
  }

  if (
    payload?.errors?.some(
      (error) =>
        error.message?.includes(
          "my|FlightLogger API key",
        ),
    )
  ) {
    return "myFlightLogger";
  }

  return "unknown";
}

function collectAircraft(
  value: unknown,
  seen: Map<
    string,
    FlightLoggerAircraft
  >,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAircraft(
        item,
        seen,
      );
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const aircraft =
    normalizeAircraft(
      value.aircraft,
    );

  if (
    aircraft &&
    !seen.has(aircraft.id)
  ) {
    seen.set(
      aircraft.id,
      aircraft,
    );
  }

  for (const item of Object.values(
    value,
  )) {
    if (
      item &&
      typeof item === "object"
    ) {
      collectAircraft(
        item,
        seen,
      );
    }
  }
}

function normalizeAircraft(
  input: unknown,
): FlightLoggerAircraft | null {
  if (!isRecord(input)) {
    return null;
  }

  const id =
    stringValue(input.id);

  const callSign =
    stringValue(
      input.callSign,
    );

  const model =
    stringValue(
      input.model,
    );

  if (
    !id ||
    !callSign ||
    !model
  ) {
    return null;
  }

  const maintenanceConnection =
    recordValue(
      input.maintenanceParts,
    );

  const maintenanceParts =
    arrayValue(
      maintenanceConnection
        ?.nodes,
    )
      .map(
        normalizeMaintenancePart,
      )
      .filter(
        (
          item,
        ): item is NonNullable<
          typeof item
        > => item !== null,
      );

  return {
    id,
    callSign,
    model,

    aircraftClass:
      stringValue(
        input.aircraftClass,
      ),

    aircraftType:
      stringValue(
        input.aircraftType,
      ),

    currentAirport:
      normalizeAirport(
        input.currentAirport,
      ),

    homeAirport:
      normalizeAirport(
        input.homeAirport,
      ),

    defaultEngineType:
      nullableString(
        input.defaultEngineType,
      ),

    defaultPMF:
      nullableString(
        input.defaultPMF,
      ),

    disabled:
      booleanValue(
        input.disabled,
      ),

    fuelCoefficient:
      numberValue(
        input.fuelCoefficient,
      ),

    fuelCoefficientMeasurement:
      nullableString(
        input.fuelCoefficientMeasurement,
      ),

    fuelCoefficientUnit:
      nullableString(
        input.fuelCoefficientUnit,
      ),

    taxiInTime:
      numberValue(
        input.taxiInTime,
      ),

    taxiOutTime:
      numberValue(
        input.taxiOutTime,
      ),

    timerSeconds:
      numberValue(
        input.timerSeconds,
      ),

    totalAirborneMinutes:
      numberValue(
        input.totalAirborneMinutes,
      ),

    totalFuel:
      numberValue(
        input.totalFuel,
      ),

    totalLandings:
      numberValue(
        input.totalLandings,
      ),

    typeOfTimer:
      nullableString(
        input.typeOfTimer,
      ),

    typeOfTimerMeasurement:
      nullableString(
        input.typeOfTimerMeasurement,
      ),

    primaryLog:
      normalizeLog(
        input.primaryLog,
      ),

    secondaryLog:
      normalizeLog(
        input.secondaryLog,
      ),

    tertiaryLog:
      normalizeLog(
        input.tertiaryLog,
      ),

    nextService:
      normalizeService(
        input.nextService,
      ),

    worstMaintenanceWarning:
      normalizeWarning(
        input.worstMaintenanceWarning,
      ),

    worstWarning:
      normalizeWarning(
        input.worstWarning,
      ),

    maintenanceParts,

    raw: input,
  };
}

function normalizeAirport(
  input: unknown,
) {
  const record =
    recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(
      record.id,
    ),
    name: stringValue(
      record.name,
    ),
  };
}

function normalizeLog(
  input: unknown,
) {
  const record =
    recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(
      record.id,
    ),

    type: stringValue(
      record.type,
    ),

    measurementType:
      stringValue(
        record.measurementType,
      ),

    totalSeconds:
      numberValue(
        record.totalSeconds,
      ),

    durationWarningPercent:
      numberValue(
        record.durationWarningPercent,
      ),

    offsetWarningSecondsStart:
      numberValue(
        record.offsetWarningSecondsStart,
      ),

    offsetWarningSecondsEnd:
      numberValue(
        record.offsetWarningSecondsEnd,
      ),

    actionButtonsIsEnabled:
      booleanValue(
        record.actionButtonsIsEnabled,
      ),

    prefillIsEnabled:
      booleanValue(
        record.prefillIsEnabled,
      ),
  };
}

function normalizeMaintenancePart(
  input: unknown,
) {
  const record =
    recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(
      record.id,
    ),

    name: stringValue(
      record.name,
    ),

    serialNumber:
      nullableString(
        record.serialNumber,
      ),

    status:
      nullableString(
        record.status,
      ),

    expirationCycles:
      numberValue(
        record.expirationCycles,
      ),

    expirationDate:
      nullableString(
        record.expirationDate,
      ),

    expirationLogSeconds:
      numberValue(
        record.expirationLogSeconds,
      ),

    expiresOnLog:
      nullableString(
        record.expiresOnLog,
      ),

    approvedAt:
      nullableString(
        record.approvedAt,
      ),

    rejectedAt:
      nullableString(
        record.rejectedAt,
      ),

    maintenanceType:
      normalizeMaintenanceType(
        record.maintenanceType,
      ),
  };
}

function normalizeService(
  input: unknown,
) {
  const record =
    recordValue(input);

  if (!record) {
    return null;
  }

  return {
    cyclesWarningColor:
      nullableString(
        record.cyclesWarningColor,
      ),

    dateWarningColor:
      nullableString(
        record.dateWarningColor,
      ),

    nextPrimaryService:
      numberValue(
        record.nextPrimaryService,
      ),

    nextSecondaryService:
      numberValue(
        record.nextSecondaryService,
      ),

    nextServiceCycles:
      numberValue(
        record.nextServiceCycles,
      ),

    nextServiceDate:
      nullableString(
        record.nextServiceDate,
      ),

    nextTertiaryService:
      numberValue(
        record.nextTertiaryService,
      ),

    primaryWarningColor:
      nullableString(
        record.primaryWarningColor,
      ),

    secondaryWarningColor:
      nullableString(
        record.secondaryWarningColor,
      ),

    tertiaryWarningColor:
      nullableString(
        record.tertiaryWarningColor,
      ),
  };
}

function normalizeMaintenanceType(
  input: unknown,
) {
  const record =
    recordValue(input);

  if (!record) {
    return null;
  }

  return {
    name: stringValue(
      record.name,
    ),

    disabled:
      booleanValue(
        record.disabled,
      ),

    expiresOnCycles:
      booleanValue(
        record.expiresOnCycles,
      ),

    expiresOnDate:
      booleanValue(
        record.expiresOnDate,
      ),

    expiresOnLog:
      nullableString(
        record.expiresOnLog,
      ),

    requireSerialNumber:
      booleanValue(
        record.requireSerialNumber,
      ),

    requireUploadOfDocument:
      booleanValue(
        record.requireUploadOfDocument,
      ),

    triggerOnLogTime:
      booleanValue(
        record.triggerOnLogTime,
      ),

    createdAt:
      nullableString(
        record.createdAt,
      ),

    updatedAt:
      nullableString(
        record.updatedAt,
      ),
  };
}

function normalizeWarning(
  input: unknown,
) {
  const record =
    recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(
      record.id,
    ),

    color:
      nullableString(
        record.color,
      ),

    cyclesLeft:
      numberValue(
        record.cyclesLeft,
      ),

    daysLeft:
      numberValue(
        record.daysLeft,
      ),

    expiryCycles:
      nullableString(
        record.expiryCycles,
      ),

    expiryDate:
      nullableString(
        record.expiryDate,
      ),

    expiryTime:
      numberValue(
        record.expiryTime,
      ),

    hasDocument:
      booleanValue(
        record.hasDocument,
      ),

    logMeasurementType:
      stringValue(
        record.logMeasurementType,
      ),

    logType:
      nullableString(
        record.logType,
      ),

    requirers:
      arrayValue(
        record.requirers,
      ).filter(
        (
          item,
        ): item is string =>
          typeof item ===
          "string",
      ),

    serialNumber:
      nullableString(
        record.serialNumber,
      ),

    status:
      stringValue(
        record.status,
      ),

    subjectName:
      stringValue(
        record.subjectName,
      ),

    timeLeft:
      numberValue(
        record.timeLeft,
      ),

    typeOfTimer:
      nullableString(
        record.typeOfTimer,
      ),

    typeOfTimerMeasurement:
      stringValue(
        record.typeOfTimerMeasurement,
      ),
  };
}

function filterAircraft(
  aircraft: FlightLoggerAircraft[],
  options: {
    callSigns: string[];
    aircraftClass: string | null;
  },
) {
  const wantedCallSigns =
    new Set(
      options.callSigns
        .map((value) =>
          value
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    );

  const wantedClass =
    options.aircraftClass
      ?.trim()
      .toUpperCase() ||
    null;

  return aircraft.filter(
    (item) => {
      if (
        wantedCallSigns.size >
          0 &&
        !wantedCallSigns.has(
          item.callSign
            .trim()
            .toUpperCase(),
        )
      ) {
        return false;
      }

      if (
        wantedClass &&
        (
          item.aircraftClass ??
          ""
        )
          .trim()
          .toUpperCase() !==
          wantedClass
      ) {
        return false;
      }

      return true;
    },
  );
}

function readCsv(
  value: string | null,
): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) =>
      entry.trim(),
    )
    .filter(Boolean);
}

function tokenFromRequest(
  request: Request,
) {
  const authorization =
    request.headers.get(
      "authorization",
    ) ?? "";

  const bearer =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    )?.[1]?.trim();

  return (
    bearer ||
    request.headers
      .get(
        "x-flightlogger-token",
      )
      ?.trim() ||
    null
  );
}

function statusForError(
  message: string,
): number {
  if (
    message.includes(
      "required",
    )
  ) {
    return 400;
  }

  if (
    message.includes(
      "my|FlightLogger API key",
    )
  ) {
    return 403;
  }

  if (
    message.includes(
      "Cannot query field",
    )
  ) {
    return 502;
  }

  if (
    isComplexityError(
      message,
    )
  ) {
    return 502;
  }

  return 500;
}

function friendlyError(
  message: string,
): string {
  if (
    message.includes(
      "FLIGHTLOGGER_API_TOKEN",
    )
  ) {
    return "FlightLogger API token is required. Add your own token in FlightLogger Calendar or Aircrafts.";
  }

  if (
    message.includes(
      "my|FlightLogger API key",
    )
  ) {
    return "This token looks like a my|FlightLogger API key. Use an account-specific FlightLogger API key with aircraft or bookings access.";
  }

  if (
    message.includes(
      "Cannot query field",
    )
  ) {
    return "FlightLogger did not accept one of the aircraft data fields. The aircraft API schema may differ for this account.";
  }

  if (
    isComplexityError(
      message,
    )
  ) {
    return "FlightLogger rejected the aircraft query because it exceeds the GraphQL complexity limit.";
  }

  return "Unable to load FlightLogger aircraft. Check the token and account permissions.";
}

function sanitizeErrorDetail(
  message: string,
): string {
  return message.replace(
    /Bearer\s+[A-Za-z0-9._-]+/g,
    "Bearer [redacted]",
  );
}

function json(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        ...headers,
      },
    },
  );
}

function runtimeEnv() {
  return (
    (
      globalThis as unknown as {
        process?: {
          env?: Record<
            string,
            string | undefined
          >;
        };
      }
    ).process?.env ?? {}
  );
}

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null
  );
}

function recordValue(
  value: unknown,
): Record<
  string,
  unknown
> | null {
  return isRecord(value)
    ? value
    : null;
}

function arrayValue(
  value: unknown,
): unknown[] {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function stringValue(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value
    : "";
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value ===
    "string"
    ? value
    : null;
}

function numberValue(
  value: unknown,
): number | null {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric,
  )
    ? numeric
    : null;
}

function booleanValue(
  value: unknown,
): boolean | undefined {
  return typeof value ===
    "boolean"
    ? value
    : undefined;
}