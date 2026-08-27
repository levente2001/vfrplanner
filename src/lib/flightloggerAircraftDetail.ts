import {
  AIRCRAFT_DETAIL_CORE_QUERY,
  AIRCRAFT_DETAIL_WARNINGS_QUERY,
  AIRCRAFT_MAINTENANCE_QUERY,
} from "../flightlogger/shared/aircraftQuery";

import type {
  FlightLoggerAircraft,
  FlightLoggerMaintenancePart,
} from "../flightlogger/shared/aircraftTypes";

const DEFAULT_ENDPOINT = "https://api.flightlogger.net/graphql";

const MAINTENANCE_PAGE_SIZE = 5;
const MAX_MAINTENANCE_PAGES = 30;

type MaintenanceStatus = "APPROVED" | "EXPIRED" | "TO_APPROVAL";

type AircraftConnection = {
  aircraft?: {
    nodes?: unknown[];
  };
};

type MaintenancePageInfo = {
  endCursor?: string | null;
  hasNextPage?: boolean;
};

type MaintenanceNode = {
  maintenanceParts?: {
    nodes?: unknown[];
    pageInfo?: MaintenancePageInfo;
  };
};

type MaintenanceConnection = {
  aircraft?: {
    nodes?: MaintenanceNode[];
  };
};

type AircraftDetailResponse = {
  aircraft: FlightLoggerAircraft;
  maintenancePages: Record<MaintenanceStatus, number>;
  partial?: boolean;
  warning?: string;
};

export async function handleFlightLoggerAircraftDetail(request: Request) {
  if (request.method !== "GET") {
    return json(
      {
        error: "Method not allowed",
      },
      405,
      {
        Allow: "GET",
      },
    );
  }

  try {
    const url = new URL(request.url);

    const callSign = (
      url.searchParams.get("callSign") ??
      url.searchParams.get("callsign") ??
      ""
    )
      .trim()
      .toUpperCase();

    if (!callSign) {
      return json(
        {
          error: "Aircraft callsign is required.",
        },
        400,
      );
    }

    const env = runtimeEnv();

    const token =
      tokenFromRequest(request) || env.FLIGHTLOGGER_API_TOKEN || env.API_KEY;

    const endpoint = env.FLIGHTLOGGER_API_URL || DEFAULT_ENDPOINT;

    if (!token) {
      throw new Error("FLIGHTLOGGER_API_TOKEN is required.");
    }

    /*
     * These are intentionally separate GraphQL requests.
     *
     * FlightLogger applies its complexity limit PER QUERY,
     * therefore multiple small requests are much safer than
     * one enormous nested aircraft query.
     */
    const warnings: string[] = [];
    const coreResult = await requestFlightLogger<AircraftConnection>(
      endpoint,
      token,
      {
        callSigns: [callSign],
      },
      AIRCRAFT_DETAIL_CORE_QUERY,
    );

    const [warningsResult, requiringApproval, current, previous] =
      await Promise.all([
        optionalFlightLoggerRequest<AircraftConnection>(
          endpoint,
          token,
          {
            callSigns: [callSign],
          },
          AIRCRAFT_DETAIL_WARNINGS_QUERY,
          "Maintenance warning data",
        ),

        optionalMaintenance(endpoint, token, callSign, "TO_APPROVAL"),

        optionalMaintenance(endpoint, token, callSign, "APPROVED"),

        optionalMaintenance(endpoint, token, callSign, "EXPIRED"),
      ]);

    warnings.push(
      ...warningsResult.warnings,
      ...requiringApproval.warnings,
      ...current.warnings,
      ...previous.warnings,
    );

    const coreNode = coreResult.aircraft?.nodes?.[0];

    if (!coreNode || !isRecord(coreNode)) {
      return json(
        {
          error: `Aircraft ${callSign} was not found.`,
        },
        404,
      );
    }

    const warningsNode = warningsResult.data?.aircraft?.nodes?.[0];

    const mergedRaw: Record<string, unknown> = {
      ...coreNode,

      ...(isRecord(warningsNode) ? warningsNode : {}),

      requiringApprovalMaintenanceParts: {
        nodes: requiringApproval.nodes,
      },

      currentMaintenanceParts: {
        nodes: current.nodes,
      },

      previousMaintenanceParts: {
        nodes: previous.nodes,
      },

      maintenanceParts: {
        nodes: [
          ...requiringApproval.nodes,
          ...current.nodes,
          ...previous.nodes,
        ],
      },
    };

    const aircraft = normalizeAircraft(mergedRaw);

    if (!aircraft) {
      throw new Error(
        `FlightLogger returned invalid aircraft data for ${callSign}.`,
      );
    }

    const response: AircraftDetailResponse = {
      aircraft,
      maintenancePages: {
        TO_APPROVAL: requiringApproval.pages,
        APPROVED: current.pages,
        EXPIRED: previous.pages,
      },
      partial:
        requiringApproval.hasNextPage ||
        current.hasNextPage ||
        previous.hasNextPage,
      warning: [
        requiringApproval.hasNextPage
          ? `Requiring approval maintenance loading stopped after ${MAX_MAINTENANCE_PAGES} pages. Additional maintenance items may exist.`
          : null,
        current.hasNextPage
          ? `Current maintenance loading stopped after ${MAX_MAINTENANCE_PAGES} pages. Additional maintenance items may exist.`
          : null,
        previous.hasNextPage
          ? `Previous maintenance loading stopped after ${MAX_MAINTENANCE_PAGES} pages. Additional maintenance items may exist.`
          : null,
        ...warnings,
      ]
        .filter(Boolean)
        .join(" "),
    };

    return json(response, 200, {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load aircraft details.";

    return json(
      {
        error: friendlyError(message),

        /*
         * Keep this visible during development.
         *
         * It does not contain the API token because
         * sanitizeErrorDetail removes Bearer values.
         */
        detail:
          runtimeEnv().NODE_ENV === "production"
            ? undefined
            : sanitizeErrorDetail(message),
      },
      statusForError(message),
    );
  }
}

async function fetchAllMaintenance(
  endpoint: string,
  token: string,
  callSign: string,
  status: MaintenanceStatus,
) {
  const nodes: unknown[] = [];
  let nullNodeCount = 0;

  let cursor: string | undefined;

  let hasNextPage = true;
  let pages = 0;

  while (hasNextPage && pages < MAX_MAINTENANCE_PAGES) {
    const result = await requestFlightLogger<MaintenanceConnection>(
      endpoint,
      token,
      {
        callSigns: [callSign],
        maintenanceStatuses: [status],
        maintenanceAfter: cursor,
        maintenanceFirst: MAINTENANCE_PAGE_SIZE,
      },
      AIRCRAFT_MAINTENANCE_QUERY,
    );

    const aircraftNode = result.aircraft?.nodes?.[0];

    if (!aircraftNode) {
      break;
    }

    const connection = aircraftNode.maintenanceParts;

    const pageNodes = connection?.nodes ?? [];

    nullNodeCount += pageNodes.filter((node) => node === null).length;
    nodes.push(...pageNodes.filter((node) => node !== null));

    const pageInfo = connection?.pageInfo;

    const endCursor = pageInfo?.endCursor;

    hasNextPage = Boolean(pageInfo?.hasNextPage && endCursor);

    cursor = endCursor ?? undefined;

    pages += 1;
  }

  return {
    nodes,
    pages,
    hasNextPage,
    nullNodeCount,
  };
}

async function optionalMaintenance(
  endpoint: string,
  token: string,
  callSign: string,
  status: MaintenanceStatus,
) {
  try {
    const result = await fetchAllMaintenance(endpoint, token, callSign, status);

    return {
      ...result,
      warnings: [] as string[],
    };
  } catch (error) {
    return {
      nodes: [] as unknown[],
      pages: 0,
      hasNextPage: false,
      nullNodeCount: 0,
      warnings: [
        `${maintenanceStatusLabel(status)} maintenance could not be loaded: ${compactErrorMessage(error)}`,
      ],
    };
  }
}

async function optionalFlightLoggerRequest<T>(
  endpoint: string,
  token: string,
  variables: Record<string, unknown>,
  query: string,
  label: string,
): Promise<{ data: T | null; warnings: string[] }> {
  try {
    return {
      data: await requestFlightLogger<T>(endpoint, token, variables, query),
      warnings: [],
    };
  } catch (error) {
    return {
      data: null,
      warnings: [`${label} could not be loaded: ${compactErrorMessage(error)}`],
    };
  }
}

function maintenanceStatusLabel(status: MaintenanceStatus) {
  switch (status) {
    case "APPROVED":
      return "Current";
    case "EXPIRED":
      return "Previous";
    case "TO_APPROVAL":
      return "Requiring approval";
  }
}

async function requestFlightLogger<T>(
  endpoint: string,
  token: string,
  variables: Record<string, unknown>,
  query: string,
): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      "content-type": "application/json",

      authorization: `Bearer ${token}`,
    },

    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: T;

    errors?: Array<{
      message?: string;
    }>;
  } | null;

  if (!response.ok || payload?.errors?.length) {
    const message = payload?.errors
      ?.map((item) => item.message)
      .filter(Boolean)
      .join("; ");

    throw new Error(
      message ||
        `FlightLogger aircraft detail request failed with HTTP ${response.status}.`,
    );
  }

  if (!payload?.data) {
    throw new Error("FlightLogger returned an empty aircraft detail response.");
  }

  return payload.data;
}

function compactErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  const parts = message
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join("; ") || "An unknown error occurred.";
}

function normalizeAircraft(input: unknown): FlightLoggerAircraft | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = stringValue(input.id);

  const callSign = stringValue(input.callSign);

  const model = stringValue(input.model);

  if (!id || !callSign || !model) {
    return null;
  }

  const maintenanceConnection = recordValue(input.maintenanceParts);
  const requiringApprovalConnection = recordValue(
    input.requiringApprovalMaintenanceParts,
  );
  const currentMaintenanceConnection = recordValue(
    input.currentMaintenanceParts,
  );
  const previousMaintenanceConnection = recordValue(
    input.previousMaintenanceParts,
  );

  const maintenanceParts = arrayValue(maintenanceConnection?.nodes)
    .map(normalizeMaintenancePart)
    .filter((item): item is FlightLoggerMaintenancePart => item !== null);
  const requiringApprovalMaintenanceParts = arrayValue(
    requiringApprovalConnection?.nodes,
  )
    .map(normalizeMaintenancePart)
    .filter((item): item is FlightLoggerMaintenancePart => item !== null);
  const currentMaintenanceParts = arrayValue(
    currentMaintenanceConnection?.nodes,
  )
    .map(normalizeMaintenancePart)
    .filter((item): item is FlightLoggerMaintenancePart => item !== null);
  const previousMaintenanceParts = arrayValue(
    previousMaintenanceConnection?.nodes,
  )
    .map(normalizeMaintenancePart)
    .filter((item): item is FlightLoggerMaintenancePart => item !== null);

  return {
    id,
    callSign,
    model,

    aircraftClass: stringValue(input.aircraftClass),

    aircraftType: stringValue(input.aircraftType),

    currentAirport: normalizeAirport(input.currentAirport),

    homeAirport: normalizeAirport(input.homeAirport),

    defaultEngineType: nullableString(input.defaultEngineType),

    defaultPMF: nullableString(input.defaultPMF),

    disabled: booleanValue(input.disabled),

    fuelCoefficient: numberValue(input.fuelCoefficient),

    fuelCoefficientMeasurement: nullableString(
      input.fuelCoefficientMeasurement,
    ),

    fuelCoefficientUnit: nullableString(input.fuelCoefficientUnit),

    taxiInTime: numberValue(input.taxiInTime),

    taxiOutTime: numberValue(input.taxiOutTime),

    timerSeconds: numberValue(input.timerSeconds),

    totalAirborneMinutes: numberValue(input.totalAirborneMinutes),

    totalFuel: numberValue(input.totalFuel),

    totalLandings: numberValue(input.totalLandings),

    typeOfTimer: nullableString(input.typeOfTimer),

    typeOfTimerMeasurement: nullableString(input.typeOfTimerMeasurement),

    primaryLog: normalizeLog(input.primaryLog),

    secondaryLog: normalizeLog(input.secondaryLog),

    tertiaryLog: normalizeLog(input.tertiaryLog),

    nextService: normalizeService(input.nextService),

    worstMaintenanceWarning: normalizeWarning(input.worstMaintenanceWarning),

    worstWarning: normalizeWarning(input.worstWarning),

    requiringApprovalMaintenanceParts,

    currentMaintenanceParts,

    previousMaintenanceParts,

    maintenanceParts,

    raw: input,
  };
}

function normalizeAirport(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(record.id),

    name: stringValue(record.name),
  };
}

function normalizeLog(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(record.id),

    type: stringValue(record.type),

    measurementType: stringValue(record.measurementType),

    totalSeconds: numberValue(record.totalSeconds),

    durationWarningPercent: numberValue(record.durationWarningPercent),

    offsetWarningSecondsStart: numberValue(record.offsetWarningSecondsStart),

    offsetWarningSecondsEnd: numberValue(record.offsetWarningSecondsEnd),

    actionButtonsIsEnabled: booleanValue(record.actionButtonsIsEnabled),

    prefillIsEnabled: booleanValue(record.prefillIsEnabled),
  };
}

function normalizeMaintenancePart(
  input: unknown,
): FlightLoggerMaintenancePart | null {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(record.id),

    name: stringValue(record.name),

    serialNumber: nullableString(record.serialNumber),

    status: nullableString(record.status),

    expirationCycles: numberValue(record.expirationCycles),

    expirationDate: nullableString(record.expirationDate),

    expirationLogSeconds: numberValue(record.expirationLogSeconds),

    expiresOnLog: nullableString(record.expiresOnLog),

    approvedAt: nullableString(record.approvedAt),

    rejectedAt: nullableString(record.rejectedAt),

    audit: normalizeAudit(record.audit),

    approvedBy: normalizeUser(record.approvedBy),

    rejectedBy: normalizeUser(record.rejectedBy),

    maintenanceType: normalizeMaintenanceType(record.maintenanceType),
  };
}

function normalizeAudit(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    createdAt: nullableString(record.createdAt),
    createdById: nullableString(record.createdById),
    updatedAt: nullableString(record.updatedAt),
    updatedById: nullableString(record.updatedById),
  };
}

function normalizeUser(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(record.id),
    callSign: stringValue(record.callSign),
    firstName: stringValue(record.firstName),
    lastName: stringValue(record.lastName),
  };
}

function normalizeMaintenanceType(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    name: stringValue(record.name),

    disabled: booleanValue(record.disabled),

    expiresOnCycles: booleanValue(record.expiresOnCycles),

    expiresOnDate: booleanValue(record.expiresOnDate),

    expiresOnLog: nullableString(record.expiresOnLog),

    requireSerialNumber: booleanValue(record.requireSerialNumber),

    requireUploadOfDocument: booleanValue(record.requireUploadOfDocument),

    triggerOnLogTime: booleanValue(record.triggerOnLogTime),

    createdAt: nullableString(record.createdAt),

    updatedAt: nullableString(record.updatedAt),
  };
}

function normalizeService(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    cyclesWarningColor: nullableString(record.cyclesWarningColor),

    dateWarningColor: nullableString(record.dateWarningColor),

    nextPrimaryService: numberValue(record.nextPrimaryService),

    nextSecondaryService: numberValue(record.nextSecondaryService),

    nextServiceCycles: numberValue(record.nextServiceCycles),

    nextServiceDate: nullableString(record.nextServiceDate),

    nextTertiaryService: numberValue(record.nextTertiaryService),

    primaryWarningColor: nullableString(record.primaryWarningColor),

    secondaryWarningColor: nullableString(record.secondaryWarningColor),

    tertiaryWarningColor: nullableString(record.tertiaryWarningColor),
  };
}

function normalizeWarning(input: unknown) {
  const record = recordValue(input);

  if (!record) {
    return null;
  }

  return {
    id: stringValue(record.id),

    color: nullableString(record.color),

    cyclesLeft: numberValue(record.cyclesLeft),

    daysLeft: numberValue(record.daysLeft),

    expiryCycles: nullableString(record.expiryCycles),

    expiryDate: nullableString(record.expiryDate),

    expiryTime: numberValue(record.expiryTime),

    hasDocument: booleanValue(record.hasDocument),

    logMeasurementType: stringValue(record.logMeasurementType),

    logType: nullableString(record.logType),

    requirers: arrayValue(record.requirers).filter(
      (item): item is string => typeof item === "string",
    ),

    serialNumber: nullableString(record.serialNumber),

    status: stringValue(record.status),

    subjectName: stringValue(record.subjectName),

    timeLeft: numberValue(record.timeLeft),

    typeOfTimer: nullableString(record.typeOfTimer),

    typeOfTimerMeasurement: stringValue(record.typeOfTimerMeasurement),
  };
}

function tokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearer || request.headers.get("x-flightlogger-token")?.trim() || null;
}

function friendlyError(message: string) {
  if (/complexity/i.test(message)) {
    return "FlightLogger rejected one of the aircraft detail queries because it exceeded the GraphQL complexity limit.";
  }

  if (/permission|forbidden|not authorized|not allowed/i.test(message)) {
    return "FlightLogger did not permit one of the requested aircraft detail fields.";
  }

  if (message.includes("FLIGHTLOGGER_API_TOKEN")) {
    return "FlightLogger API token is required.";
  }

  return "Unable to load FlightLogger aircraft details.";
}

function statusForError(message: string) {
  if (message.includes("required")) {
    return 400;
  }

  if (/permission|forbidden|not authorized|not allowed/i.test(message)) {
    return 403;
  }

  if (/complexity|Cannot query field/i.test(message)) {
    return 502;
  }

  return 500;
}

function sanitizeErrorDetail(message: string) {
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
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
        process?: {
          env?: Record<string, string | undefined>;
        };
      }
    ).process?.env ?? {}
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
