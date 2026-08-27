import { useMemo, useRef, useState, type ReactNode } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Download,
  Filter,
  KeyRound,
  Plane,
  RefreshCcw,
  WifiOff,
} from "lucide-react";
import type { User } from "firebase/auth";
import type {
  BookingStatus,
  BookingSubtype,
  CalendarBooking,
} from "./shared/types";
import { useBookings } from "./api/bookings";
import { EventDrawer } from "./components/EventDrawer";
import { FilterSheet } from "./components/FilterSheet";
import { FlightLoggerGate, useFlightLoggerToken } from "./components/AuthGate";
import { downloadIcs, rangeBookingsFilename } from "./utils/calendarExport";
import { readableTextColor, statusTone } from "./utils/colors";

const today = new Date();

export default function FlightLoggerPanel({ user }: { user: User | null }) {
  const { apiToken, saveToken } = useFlightLoggerToken(user);

  return (
    <section id="flightlogger" className="flightlogger-panel text-zinc-950">
      <FlightLoggerGate
        user={user}
        apiToken={apiToken}
        featureName="FlightLogger Calendar"
        onSaveToken={saveToken}
      >
        <FlightLoggerCalendar
          apiToken={apiToken}
          userEmail={user?.email ?? null}
          onReplaceToken={() => saveToken("")}
        />
      </FlightLoggerGate>
    </section>
  );
}

function FlightLoggerCalendar({
  apiToken,
  userEmail,
  onReplaceToken,
}: {
  apiToken: string;
  userEmail: string | null;
  onReplaceToken: () => void;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [fromDate, setFromDate] = useState(
    format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = useState(
    format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<BookingStatus[]>([]);
  const [subtypes, setSubtypes] = useState<BookingSubtype[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] =
    useState<CalendarBooking | null>(null);

  const filters = useMemo(
    () => ({
      from: startOfDay(parseDateInput(fromDate)).toISOString(),
      to: endOfDay(parseDateInput(toDate)).toISOString(),
      statuses,
      subtypes,
      search,
    }),
    [fromDate, search, statuses, subtypes, toDate],
  );

  const bookingsQuery = useBookings(filters, apiToken);
  const bookings = useMemo(
    () => bookingsQuery.data?.bookings ?? [],
    [bookingsQuery.data?.bookings],
  );

  const events = useMemo<EventInput[]>(
    () =>
      bookings.map((booking) => ({
        id: booking.id,
        title: booking.title,
        start: booking.start,
        end: booking.end,
        backgroundColor: booking.color,
        borderColor: booking.color,
        textColor: readableTextColor(booking.color),
        extendedProps: { booking },
      })),
    [bookings],
  );

  const nextSevenDays = useMemo(() => {
    const start = startOfDay(new Date());
    const end = endOfDay(addDays(start, 7));
    return bookings
      .filter((booking) =>
        isWithinInterval(parseISO(booking.start), { start, end }),
      )
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 6);
  }, [bookings]);

  function handleDatesSet(arg: DatesSetArg) {
    const nextFrom = format(arg.start, "yyyy-MM-dd");
    const nextTo = format(addDays(arg.end, -1), "yyyy-MM-dd");
    setFromDate((current) => (current === nextFrom ? current : nextFrom));
    setToDate((current) => (current === nextTo ? current : nextTo));
  }

  function changeView(
    view: "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek",
  ) {
    calendarRef.current?.getApi().changeView(view);
  }

  function goToday() {
    const calendarApi = calendarRef.current?.getApi();
    calendarApi?.today();
    const start = startOfDay(new Date());
    const viewType = calendarApi?.view.type;
    if (viewType === "dayGridMonth") {
      setFromDate(format(startOfMonth(start), "yyyy-MM-dd"));
      setToDate(format(endOfMonth(start), "yyyy-MM-dd"));
      return;
    }
    if (viewType === "timeGridDay") {
      setFromDate(format(start, "yyyy-MM-dd"));
      setToDate(format(start, "yyyy-MM-dd"));
      return;
    }
    setFromDate(format(startOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    setToDate(format(endOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  }

  function updateFromDate(value: string) {
    setFromDate(value);
    calendarRef.current?.getApi().gotoDate(parseDateInput(value));
  }

  function exportVisible() {
    downloadIcs(bookings, rangeBookingsFilename(filters.from, filters.to));
  }

  function handleEventClick(event: EventClickArg) {
    setSelectedBooking(event.event.extendedProps.booking as CalendarBooking);
  }

  const rangeLabel = `${format(parseDateInput(fromDate), "MMM d")} - ${format(parseDateInput(toDate), "MMM d, yyyy")}`;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-700 text-white">
              <Plane size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-zinc-950 sm:text-lg">
                FlightLogger Calendar
              </h1>
              <p className="truncate text-xs text-zinc-600">
                {rangeLabel}
                {userEmail ? ` · ${userEmail}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:border-cyan-600 hover:text-cyan-800"
              onClick={onReplaceToken}
              aria-label="Replace FlightLogger API token"
            >
              <KeyRound size={16} />
              <span className="hidden sm:inline">Replace token</span>
            </button>
            <IconButton
              label="Refresh"
              onClick={() => bookingsQuery.refetch()}
              loading={bookingsQuery.isFetching}
            >
              <RefreshCcw
                size={18}
                className={bookingsQuery.isFetching ? "animate-spin" : ""}
              />
            </IconButton>
            <IconButton label="Filters" onClick={() => setFilterOpen(true)}>
              <Filter size={18} />
            </IconButton>
            <IconButton
              label="Export"
              onClick={exportVisible}
              disabled={!bookings.length}
            >
              <Download size={18} />
            </IconButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 md:px-5">
        <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-cyan-800">
              {bookings.length} bookings
            </p>
            <p className="text-xs text-zinc-600">
              {bookingsQuery.data?.cached
                ? "Showing last successful response"
                : "Live FlightLogger window"}
              {bookingsQuery.data?.pageInfo.hasNextPage
                ? " - more pages available"
                : ""}
            </p>
          </div>
          <div className="grid w-full grid-cols-4 gap-2 sm:w-auto">
            <ViewButton
              label="Month"
              onClick={() => changeView("dayGridMonth")}
            />
            <ViewButton
              label="Week"
              onClick={() => changeView("timeGridWeek")}
            />
            <ViewButton label="Day" onClick={() => changeView("timeGridDay")} />
            <ViewButton label="Agenda" onClick={() => changeView("listWeek")} />
          </div>
        </section>

        {bookingsQuery.isError ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {bookingsQuery.error instanceof Error
              ? bookingsQuery.error.message
              : "Unable to load bookings."}
          </div>
        ) : null}

        {bookingsQuery.isLoading ? (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            Loading bookings...
          </div>
        ) : null}

        {bookingsQuery.data?.cached ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <WifiOff size={16} />
            Recent cached data is visible while FlightLogger is unavailable.
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white p-2 shadow-sm md:p-4">
            <FullCalendar
              ref={calendarRef}
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                listPlugin,
                interactionPlugin,
              ]}
              initialView="timeGridWeek"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "",
              }}
              height="auto"
              contentHeight="auto"
              stickyHeaderDates
              firstDay={1}
              nowIndicator
              selectable={false}
              dayMaxEvents={3}
              events={events}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventTimeFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              slotLabelFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              slotMinTime="07:00:00"
              slotMaxTime="21:00:00"
              scrollTime="07:00:00"
            />
            {!bookingsQuery.isLoading && !bookings.length ? (
              <div className="py-10 text-center text-sm text-zinc-600">
                No bookings match this date range and filters.
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-zinc-950">Next 7 days</h2>
                <span className="text-xs text-zinc-500">
                  {nextSevenDays.length} items
                </span>
              </div>
              <div className="space-y-3">
                {nextSevenDays.map((booking) => (
                  <button
                    className="w-full rounded-lg border border-zinc-200 p-3 text-left transition hover:border-cyan-600"
                    key={booking.id}
                    onClick={() => setSelectedBooking(booking)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-cyan-800">
                        {format(new Date(booking.start), "EEE HH:mm")}
                      </span>
                      <span
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${statusTone(booking.status)}`}
                      >
                        {booking.status ?? "OPEN"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-zinc-950">
                      {booking.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-600">
                      {booking.aircraft ??
                        booking.classroom ??
                        booking.location ??
                        booking.subtype}
                    </p>
                  </button>
                ))}
                {!nextSevenDays.length ? (
                  <p className="text-sm text-zinc-600">
                    No upcoming bookings in the selected filters.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-bold text-zinc-950">Legend</h2>
              <div className="grid grid-cols-1 gap-2 text-xs">
                {legendItems(bookings).map((item) => (
                  <div className="flex items-center gap-2" key={item.label}>
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-zinc-700">
                      {item.label.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>

      <FilterSheet
        open={filterOpen}
        from={fromDate}
        to={toDate}
        search={search}
        statuses={statuses}
        subtypes={subtypes}
        onClose={() => setFilterOpen(false)}
        onFromChange={updateFromDate}
        onToChange={setToDate}
        onSearchChange={setSearch}
        onStatusesChange={setStatuses}
        onSubtypesChange={setSubtypes}
        onToday={goToday}
      />
      <EventDrawer
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
  loading,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 disabled:opacity-50"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
    >
      {children}
    </button>
  );
}

function ViewButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function legendItems(bookings: CalendarBooking[]) {
  const map = new Map<string, string>();
  for (const booking of bookings) {
    if (booking.subtype && booking.color)
      map.set(booking.subtype, booking.color);
  }
  return Array.from(map.entries())
    .map(([label, color]) => ({ label, color }))
    .slice(0, 12);
}

function parseDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
}

function bookingOverlapsRange(booking: CalendarBooking, from: Date, to: Date) {
  const start = parseISO(booking.start);
  const end = parseISO(booking.end);
  return (
    isWithinInterval(start, { start: from, end: to }) ||
    isWithinInterval(end, { start: from, end: to }) ||
    (isBefore(start, from) && isAfter(end, to))
  );
}
