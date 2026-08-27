export const BOOKING_STATUSES = ["CANCELLED", "OPEN", "COMPLETED"] as const;

export const BOOKING_SUBTYPES = [
  "OPERATION",
  "MULTI_STUDENT",
  "SINGLE_STUDENT",
  "MAINTENANCE",
  "MEETING",
  "PROGRESS_TEST",
  "RENTAL",
  "EXTRA_THEORY",
  "EXAM",
  "CLASS_THEORY",
  "THEORY_RELEASE",
  "TYPE_QUESTIONNAIRE",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingSubtype = (typeof BOOKING_SUBTYPES)[number];

export type CalendarBooking = {
  id: string;
  typename: string;
  subtype?: BookingSubtype | string;
  status?: BookingStatus | string;
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  instructor?: string;
  participants?: string[];
  classroom?: string;
  aircraft?: string;
  color?: string;
  raw?: unknown;
};

export type BookingsApiResponse = {
  bookings: CalendarBooking[];
  pageInfo: {
    endCursor?: string | null;
    hasNextPage: boolean;
  };
  fetchedPages: number;
  total: number;
  cached?: boolean;
};

export type BookingsFilters = {
  from: string;
  to: string;
  statuses: BookingStatus[];
  subtypes: BookingSubtype[];
  search: string;
  changedAfter?: string;
};

export type FlightLoggerUser = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  callSign?: string | null;
  avatarUrl?: string | null;
};

export type FlightLoggerNode = Record<string, unknown> & {
  __typename?: string;
  id?: string;
  startsAt?: string;
  endsAt?: string;
  flightStartsAt?: string;
  flightEndsAt?: string;
  status?: string;
  color?: string | null;
  comment?: string | null;
};
