import type {
  BookingSubtype,
  CalendarBooking,
  FlightLoggerNode,
  FlightLoggerUser,
} from "./types";

type AnyRecord = Record<string, unknown>;

const TYPE_TO_SUBTYPE: Record<string, BookingSubtype> = {
  ClassTheoryBooking: "CLASS_THEORY",
  ExamBooking: "EXAM",
  ExtraTheoryBooking: "EXTRA_THEORY",
  MaintenanceBooking: "MAINTENANCE",
  MeetingBooking: "MEETING",
  MultiStudentBooking: "MULTI_STUDENT",
  OperationBooking: "OPERATION",
  ProgressTestBooking: "PROGRESS_TEST",
  RentalBooking: "RENTAL",
  SingleStudentBooking: "SINGLE_STUDENT",
  TheoryReleaseBooking: "THEORY_RELEASE",
  TypeQuestionnaireBooking: "TYPE_QUESTIONNAIRE",
};

const FALLBACK_COLORS: Record<string, string> = {
  CLASS_THEORY: "#2563eb",
  EXAM: "#b42318",
  EXTRA_THEORY: "#7c3aed",
  MAINTENANCE: "#64748b",
  MEETING: "#0f766e",
  MULTI_STUDENT: "#0284c7",
  OPERATION: "#0f766e",
  PROGRESS_TEST: "#ea580c",
  RENTAL: "#16a34a",
  SINGLE_STUDENT: "#1484a3",
  THEORY_RELEASE: "#4f46e5",
  TYPE_QUESTIONNAIRE: "#c2410c",
};

export function normalizeBookings(nodes: unknown[]): CalendarBooking[] {
  return nodes
    .map((node) => normalizeBooking(node))
    .filter((booking): booking is CalendarBooking => Boolean(booking));
}

export function normalizeBooking(input: unknown): CalendarBooking | null {
  if (!isRecord(input)) return null;
  const node = input as FlightLoggerNode;
  const typename = node.__typename ?? "Booking";
  const subtype = TYPE_TO_SUBTYPE[typename] ?? typename;
  const start = firstString(node.startsAt, node.flightStartsAt);
  const end = firstString(node.endsAt, node.flightEndsAt, start);
  const id = firstString(node.id, `${typename}-${start}`);

  if (!start || !end || !id) return null;

  const instructor = personName(node.instructor);
  const aircraft = aircraftName(node.aircraft);
  const classroom = recordName(node.classroom);
  const departure = recordName(node.departureAirport);
  const arrival = recordName(node.arrivalAirport);
  const location = firstString(
    classroom,
    routeName(departure, arrival),
    departure,
    arrival,
  );
  const participants = participantNames(node);
  const title = buildTitle(node, typename, subtype);
  const description = buildDescription(node, participants);

  return {
    id,
    typename,
    subtype,
    status: node.status,
    title,
    description,
    start,
    end,
    location,
    instructor,
    participants,
    classroom,
    aircraft,
    color: firstString(node.color, FALLBACK_COLORS[subtype]),
    raw: node,
  };
}

function buildTitle(
  node: FlightLoggerNode,
  typename: string,
  subtype: string,
): string {
  const subject = firstString(node.subject);
  const theoryCourse = recordName(node.theoryCourse);
  const className = recordName(node.class);
  const aircraft = aircraftName(node.aircraft);
  const operationType = recordName(node.operationType);
  const customer = customerName(node.customer);
  const student = personName(node.student);
  const renter = personName(node.renter);
  const pic = personName(node.pic);
  const participants = participantNames(node).slice(0, 2).join(", ");

  switch (typename) {
    case "ClassTheoryBooking":
      return (
        compact([subject, theoryCourse, className]).join(" - ") ||
        "Class theory"
      );
    case "ExamBooking":
      return compact(["Exam", theoryCourse, className]).join(" - ");
    case "ExtraTheoryBooking":
      return compact(["Extra theory", student, subject]).join(" - ");
    case "MaintenanceBooking":
      return compact(["Maintenance", aircraft]).join(" - ");
    case "MeetingBooking":
      return compact(["Meeting", participants]).join(" - ");
    case "MultiStudentBooking":
      return compact(["Multi-student flight", aircraft]).join(" - ");
    case "OperationBooking":
      return compact([
        operationType || "Operation",
        aircraft,
        customer || pic,
      ]).join(" - ");
    case "ProgressTestBooking":
      return compact(["Progress test", subject, theoryCourse]).join(" - ");
    case "RentalBooking":
      return compact(["Rental", aircraft, renter]).join(" - ");
    case "SingleStudentBooking":
      return compact(["Student flight", student, aircraft]).join(" - ");
    case "TheoryReleaseBooking":
      return compact(["Theory release", subject, theoryCourse]).join(" - ");
    case "TypeQuestionnaireBooking":
      return compact(["Type questionnaire", theoryCourse, className]).join(
        " - ",
      );
    default:
      return humanize(subtype);
  }
}

function buildDescription(
  node: FlightLoggerNode,
  participants: string[],
): string | undefined {
  const lines = compact([
    firstString(node.comment),
    node.status ? `Status: ${node.status}` : undefined,
    node.__typename ? `Type: ${node.__typename}` : undefined,
    personName(node.instructor)
      ? `Instructor: ${personName(node.instructor)}`
      : undefined,
    personName(node.pic) ? `PIC: ${personName(node.pic)}` : undefined,
    participants.length
      ? `Participants: ${participants.join(", ")}`
      : undefined,
    aircraftName(node.aircraft)
      ? `Aircraft: ${aircraftName(node.aircraft)}`
      : undefined,
    recordName(node.classroom)
      ? `Classroom: ${recordName(node.classroom)}`
      : undefined,
    routeName(
      recordName(node.departureAirport),
      recordName(node.arrivalAirport),
    )
      ? `Route: ${routeName(recordName(node.departureAirport), recordName(node.arrivalAirport))}`
      : undefined,
  ]);

  return lines.length ? lines.join("\n") : undefined;
}

function participantNames(node: FlightLoggerNode): string[] {
  const values = [
    ...arrayOfRecords(node.students),
    ...arrayOfRecords(node.participants),
    ...arrayOfRecords(node.crew),
    node.student,
    node.renter,
    node.pic,
  ];

  return unique(compact(values.map((value) => personName(value))));
}

function personName(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const user = input as FlightLoggerUser;
  return firstString(
    compact([user.firstName, user.lastName]).join(" ").trim(),
    user.callSign,
    user.id,
  );
}

function aircraftName(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  return (
    compact([firstString(input.callSign), firstString(input.model)]).join(
      " - ",
    ) || firstString(input.id)
  );
}

function customerName(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  return firstString(input.fullName, input.company, input.name, input.email);
}

function recordName(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  return firstString(input.name, input.title, input.id);
}

function routeName(from?: string, to?: string): string | undefined {
  if (from && to) return `${from} -> ${to}`;
  return from ?? to;
}

function arrayOfRecords(input: unknown): AnyRecord[] {
  return Array.isArray(input) ? input.filter(isRecord) : [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function compact(values: Array<string | null | undefined | false>): string[] {
  return values.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function humanize(value: string): string {
  return value
    .replace(/Booking$/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function isRecord(input: unknown): input is AnyRecord {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
