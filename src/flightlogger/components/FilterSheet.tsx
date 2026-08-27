import { X } from "lucide-react";
import {
  BOOKING_STATUSES,
  BOOKING_SUBTYPES,
  type BookingStatus,
  type BookingSubtype,
} from "../shared/types";

type Props = {
  open: boolean;
  from: string;
  to: string;
  search: string;
  statuses: BookingStatus[];
  subtypes: BookingSubtype[];
  onClose: () => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusesChange: (value: BookingStatus[]) => void;
  onSubtypesChange: (value: BookingSubtype[]) => void;
  onToday: () => void;
};

export function FilterSheet(props: Props) {
  return (
    <div
      className={`fixed inset-0 z-40 bg-slate-950/30 transition ${props.open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      onClick={props.onClose}
    >
      <aside
        className={`absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-lg bg-white p-4 shadow-xl transition md:left-auto md:top-0 md:h-full md:w-[380px] md:max-h-none md:rounded-l-lg md:rounded-t-none ${
          props.open
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-x-full md:translate-y-0"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-cyan-700">
              Filters
            </p>
            <h2 className="text-lg font-bold text-slate-950">Booking view</h2>
          </div>
          <button
            className="rounded-lg border border-slate-200 p-2 text-slate-700"
            onClick={props.onClose}
            aria-label="Close filters"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Search
            </span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600"
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder="Title, aircraft, classroom, person"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                From
              </span>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600"
                value={props.from}
                onChange={(event) => props.onFromChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                To
              </span>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600"
                value={props.to}
                onChange={(event) => props.onToChange(event.target.value)}
              />
            </label>
          </div>

          <button
            className="w-full rounded-lg bg-cyan-700 px-3 py-2 font-semibold text-white"
            onClick={props.onToday}
          >
            Today
          </button>

          <MultiSelect
            title="Status"
            options={[...BOOKING_STATUSES]}
            values={props.statuses}
            onChange={(values) =>
              props.onStatusesChange(values as BookingStatus[])
            }
          />

          <MultiSelect
            title="Subtype"
            options={[...BOOKING_SUBTYPES]}
            values={props.subtypes}
            onChange={(values) =>
              props.onSubtypesChange(values as BookingSubtype[])
            }
          />
        </div>
      </aside>
    </div>
  );
}

function MultiSelect({
  title,
  options,
  values,
  onChange,
}: {
  title: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-700">
        {title}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <button
              type="button"
              key={option}
              onClick={() =>
                onChange(
                  checked
                    ? values.filter((value) => value !== option)
                    : [...values, option],
                )
              }
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                checked
                  ? "border-cyan-700 bg-cyan-700 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {option.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
