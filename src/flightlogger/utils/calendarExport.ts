import { format } from "date-fns";
import type { CalendarBooking } from "../shared/types";

export function downloadIcs(bookings: CalendarBooking[], filename: string) {
  const blob = new Blob([createIcs(bookings)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function createIcs(bookings: CalendarBooking[]) {
  const now = toIcsDate(new Date().toISOString());
  const events = bookings.map((booking) => {
    return [
      "BEGIN:VEVENT",
      `UID:flightlogger-${escapeText(booking.id)}@flightlogger-calendar`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsDate(booking.start)}`,
      `DTEND:${toIcsDate(booking.end)}`,
      `SUMMARY:${escapeText(booking.title)}`,
      booking.description
        ? `DESCRIPTION:${escapeText(booking.description)}`
        : undefined,
      booking.location ? `LOCATION:${escapeText(booking.location)}` : undefined,
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FlightLogger Calendar//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function singleBookingFilename(booking: CalendarBooking) {
  return `flightlogger-booking-${sanitizeFilename(booking.id)}.ics`;
}

export function rangeBookingsFilename(from: string, to: string) {
  return `flightlogger-bookings-${format(new Date(from), "yyyy-MM-dd")}-${format(new Date(to), "yyyy-MM-dd")}.ics`;
}

export function googleCalendarUrl(booking: CalendarBooking) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: booking.title,
    dates: `${toGoogleDate(booking.start)}/${toGoogleDate(booking.end)}`,
    details: booking.description ?? "",
    location: booking.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toIcsDate(value: string) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function toGoogleDate(value: string) {
  return toIcsDate(value);
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]/gi, "-").slice(0, 80);
}
