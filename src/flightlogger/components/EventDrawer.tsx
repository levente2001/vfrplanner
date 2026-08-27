import { format } from "date-fns";
import { CalendarPlus, Download, ExternalLink, X } from "lucide-react";
import type { CalendarBooking } from "../shared/types";
import {
  downloadIcs,
  googleCalendarUrl,
  singleBookingFilename,
} from "../utils/calendarExport";
import { statusTone } from "../utils/colors";

type Props = {
  booking: CalendarBooking | null;
  onClose: () => void;
};

export function EventDrawer({ booking, onClose }: Props) {
  if (!booking) return null;

  const rows = [
    ["Type", booking.subtype],
    ["Status", booking.status],
    ["Instructor", booking.instructor],
    ["Aircraft", booking.aircraft],
    ["Classroom", booking.classroom],
    ["Location", booking.location],
    ["Participants", booking.participants?.join(", ")],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35" onClick={onClose}>
      <aside
        className="absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto rounded-t-lg bg-white p-4 shadow-xl md:left-auto md:top-0 md:h-full md:w-[430px] md:max-h-none md:rounded-l-lg md:rounded-t-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <span
              className={`mb-2 inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${statusTone(booking.status)}`}
            >
              {booking.status ?? "Booking"}
            </span>
            <h2 className="text-xl font-bold leading-tight text-slate-950">
              {booking.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {format(new Date(booking.start), "EEE, MMM d, HH:mm")} -{" "}
              {format(new Date(booking.end), "HH:mm")}
            </p>
          </div>
          <button
            className="rounded-lg border border-slate-200 p-2 text-slate-700"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 flex flex-col gap-2 sm:flex-row">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white"
            onClick={() =>
              downloadIcs([booking], singleBookingFilename(booking))
            }
          >
            <Download size={16} />
            Download ICS
          </button>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
            href={googleCalendarUrl(booking)}
            target="_blank"
            rel="noreferrer"
          >
            <CalendarPlus size={16} />
            Google Calendar
            <ExternalLink size={14} />
          </a>
        </div>

        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div className="rounded-lg border border-slate-200 p-3" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-sm text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>

        {booking.description ? (
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
              Notes
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">
              {booking.description}
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
