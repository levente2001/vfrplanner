import { useMemo, useState, type ReactNode } from "react";

import type { User } from "firebase/auth";

import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  Fuel,
  Gauge,
  KeyRound,
  MapPin,
  Plane,
  RefreshCcw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { useAircrafts } from "./api/aircrafts";

import { useAircraftDetail } from "./api/aircraftDetail";

import { FlightLoggerGate, useFlightLoggerToken } from "./components/AuthGate";

import type {
  FlightLoggerAircraft,
  FlightLoggerMaintenancePart,
  FlightLoggerMaintenanceWarning,
} from "./shared/aircraftTypes";

export default function AircraftsPanel({ user }: { user: User | null }) {
  const { apiToken, saveToken } = useFlightLoggerToken(user);

  return (
    <section id="aircrafts" className="flightlogger-panel text-zinc-950">
      <FlightLoggerGate
        user={user}
        apiToken={apiToken}
        featureName="FlightLogger Aircrafts"
        onSaveToken={saveToken}
      >
        <AircraftsContent
          apiToken={apiToken}
          userEmail={user?.email ?? null}
          onReplaceToken={() => saveToken("")}
        />
      </FlightLoggerGate>
    </section>
  );
}

function AircraftsContent({
  apiToken,
  userEmail,
  onReplaceToken,
}: {
  apiToken: string;
  userEmail: string | null;
  onReplaceToken: () => void;
}) {
  const [search, setSearch] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  /*
   * Lightweight list query.
   *
   * This only downloads the basic fields
   * for all aircraft.
   */
  const aircraftQuery = useAircrafts(apiToken, search);

  const aircraft = useMemo(
    () => aircraftQuery.data?.aircraft ?? [],
    [aircraftQuery.data?.aircraft],
  );

  /*
   * Keep the initial view as a fast aircraft list.
   * Details are loaded only after an explicit click, and only for the
   * row that is currently expanded.
   */
  const expandedSummary = useMemo(
    () =>
      expandedId
        ? (aircraft.find((item) => item.id === expandedId) ?? null)
        : null,
    [aircraft, expandedId],
  );

  /*
   * Heavy/detail request is performed ONLY
   * for the currently expanded aircraft.
   */
  const detailQuery = useAircraftDetail(
    apiToken,
    expandedSummary?.callSign ?? null,
  );

  const selectedAircraft = detailQuery.data?.aircraft ?? null;

  const aircraftWithWarnings = aircraft.filter(hasActiveWarning).length;

  const airworthyCount = aircraft.length - aircraftWithWarnings;

  const refreshing = aircraftQuery.isFetching || detailQuery.isFetching;

  async function refresh() {
    await aircraftQuery.refetch();

    if (expandedSummary?.callSign) {
      await detailQuery.refetch();
    }
  }

  function toggleExpanded(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-700 text-white shadow-sm">
              <Plane size={20} />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-zinc-950 sm:text-lg">
                Aircrafts
              </h1>

              <p className="truncate text-xs text-zinc-500">
                {aircraft.length} aircraft
                {userEmail ? ` · ${userEmail}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-cyan-600 hover:text-cyan-800"
              onClick={onReplaceToken}
              aria-label="Replace FlightLogger API token"
            >
              <KeyRound size={16} />

              <span className="hidden sm:inline">Replace token</span>
            </button>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 transition hover:border-cyan-600 hover:text-cyan-800 disabled:opacity-50"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh aircraft"
              title="Refresh"
            >
              <RefreshCcw
                size={18}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 md:px-5">
        <section className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 size-5 text-zinc-400" />

            <input
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by callsign, model, or class"
              aria-label="Search aircraft"
            />
          </label>

          <MetricCard
            icon={<AlertTriangle size={17} />}
            label="Warnings"
            value={String(aircraftWithWarnings)}
            tone={aircraftWithWarnings > 0 ? "warn" : "neutral"}
          />

          <MetricCard
            icon={<ShieldCheck size={17} />}
            label="Airworthy"
            value={String(airworthyCount)}
            tone="ok"
          />
        </section>

        {aircraftQuery.isError ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {aircraftQuery.error instanceof Error
              ? aircraftQuery.error.message
              : "Unable to load aircraft."}
          </div>
        ) : null}

        {aircraftQuery.isLoading ? (
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
            Loading aircraft...
          </div>
        ) : null}

        {aircraftQuery.data?.warning ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {aircraftQuery.data.warning}
          </div>
        ) : null}

        <section className="space-y-2.5">
          {aircraft.map((item) => (
            <AircraftRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => toggleExpanded(item.id)}
              detail={
                expandedId === item.id
                  ? {
                      isLoading: detailQuery.isLoading,
                      isError: detailQuery.isError,
                      error: detailQuery.error,
                      onRetry: () => detailQuery.refetch(),
                      aircraft: selectedAircraft,
                      warning: detailQuery.data?.warning ?? null,
                    }
                  : null
              }
            />
          ))}

          {!aircraftQuery.isLoading && !aircraft.length ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              No aircraft found.
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

type DetailState = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  aircraft: FlightLoggerAircraft | null;
  warning: string | null;
};

function AircraftRow({
  item,
  expanded,
  onToggle,
  detail,
}: {
  item: FlightLoggerAircraft;
  expanded: boolean;
  onToggle: () => void;
  detail: DetailState | null;
}) {
  const warning = warningSummary(item);

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
        expanded ? "border-cyan-700 ring-2 ring-cyan-700/15" : "border-zinc-200"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              item.disabled
                ? "bg-zinc-100 text-zinc-400"
                : "bg-cyan-50 text-cyan-700"
            }`}
          >
            <Plane size={18} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-bold text-zinc-950">
                {item.callSign}
              </p>

              {item.disabled ? (
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500">
                  Disabled
                </span>
              ) : null}
            </div>

            <p className="truncate text-sm text-zinc-500">
              {item.model}
              {item.homeAirport?.name ? ` · ${item.homeAirport.name}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {warning ? (
            <span className="hidden items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 sm:inline-flex">
              <AlertTriangle size={12} />
              <span className="max-w-[140px] truncate">
                {warning.subjectName || "Warning"}
              </span>
            </span>
          ) : (
            <span className="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 sm:inline-flex">
              <ShieldCheck size={12} />
              Airworthy
            </span>
          )}

          {warning ? (
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 sm:hidden" />
          ) : (
            <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 sm:hidden" />
          )}

          <ChevronDown
            size={18}
            className={`shrink-0 text-zinc-400 transition-transform duration-300 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-zinc-100 px-4 pb-4 pt-4">
            {detail ? <AircraftDetailBody detail={detail} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function AircraftDetailBody({ detail }: { detail: DetailState }) {
  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-3 py-2 text-sm text-zinc-600">
        <RefreshCcw size={16} className="animate-spin text-cyan-700" />
        Loading aircraft details...
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-700" />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-900">
              Unable to load details
            </p>

            <p className="mt-1 break-words text-sm text-rose-800">
              {detail.error instanceof Error
                ? detail.error.message
                : "Unable to load aircraft details."}
            </p>

            <button
              type="button"
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
              onClick={detail.onRetry}
            >
              <RefreshCcw size={14} />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!detail.aircraft) {
    return null;
  }

  const aircraft = detail.aircraft;
  const warning = warningSummary(aircraft);
  const requiringApproval = aircraft.requiringApprovalMaintenanceParts ?? [];
  const currentMaintenance = aircraft.currentMaintenanceParts ?? [];
  const previousMaintenance = aircraft.previousMaintenanceParts ?? [];

  return (
    <div className="space-y-4">
      {detail.warning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {detail.warning}
        </div>
      ) : null}

      {warning ? <WarningCard warning={warning} /> : <AirworthyBanner />}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <InfoTile
          icon={<Gauge size={17} />}
          label="Timer"
          value={formatDuration(aircraft.timerSeconds)}
        />

        <InfoTile
          icon={<Clock3 size={17} />}
          label="Airborne"
          value={formatMinutes(aircraft.totalAirborneMinutes)}
        />

        <InfoTile
          icon={<Fuel size={17} />}
          label="Fuel"
          value={formatNumber(aircraft.totalFuel)}
        />

        <InfoTile
          icon={<MapPin size={17} />}
          label="Current airport"
          value={aircraft.currentAirport?.name ?? ""}
        />
      </div>

      <div className="grid gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3 sm:grid-cols-2">
        <KeyValue label="Class" value={formatEnum(aircraft.aircraftClass)} />
        <KeyValue label="Type" value={formatEnum(aircraft.aircraftType)} />
        <KeyValue label="Home base" value={aircraft.homeAirport?.name ?? ""} />
        <KeyValue
          label="Status"
          value={aircraft.disabled ? "Disabled" : "Active"}
        />
      </div>

      

      <MaintenanceTable
        title="Current maintenance parts"
        parts={currentMaintenance}
        emptyText="There are no current maintenance parts."
        showRejectedBy={false}
        hideWhenEmpty
      />

      <MaintenanceTable
        title="Previous maintenance parts"
        parts={previousMaintenance}
        emptyText="There are no previous maintenance parts."
        showRejectedBy
        hideWhenEmpty
      />
    </div>
  );
}

function AirworthyBanner() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <ShieldCheck size={20} className="shrink-0 text-emerald-700" />
      <p className="text-sm font-semibold text-emerald-900">Airworthy</p>
    </div>
  );
}

function WarningCard({ warning }: { warning: FlightLoggerMaintenanceWarning }) {
  return (
    <section className={`rounded-lg border p-4 ${warningCardClass(warning)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]">
            {warning.status || "Warning"}
          </p>

          <h4 className="mt-1 break-words text-base font-bold">
            {warning.subjectName || "Maintenance warning"}
          </h4>
        </div>

        {warning.color ? (
          <span
            className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: warning.color }}
          />
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <KeyValue label="Days left" value={formatNumber(warning.daysLeft)} />
        <KeyValue
          label="Cycles left"
          value={formatNumber(warning.cyclesLeft)}
        />
        <KeyValue label="Time left" value={formatNumber(warning.timeLeft)} />
        <KeyValue label="Expiry date" value={warning.expiryDate ?? ""} />
        <KeyValue label="Serial no." value={warning.serialNumber ?? ""} />
      </div>
    </section>
  );
}

function MaintenanceTable({
  title,
  parts,
  emptyText,
  showRejectedBy,
  hideWhenEmpty = false,
}: {
  title: string;
  parts: FlightLoggerMaintenancePart[];
  emptyText: string;
  showRejectedBy: boolean;
  hideWhenEmpty?: boolean;
}) {
  if (hideWhenEmpty && !parts.length) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <h4 className="text-base font-bold text-zinc-950">{title}</h4>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-white text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Serial #</th>
              <th className="px-4 py-3 font-semibold">Expiry</th>
              <th className="px-4 py-3 font-semibold">Uploaded by</th>
              <th className="px-4 py-3 font-semibold">Approved by</th>
              {showRejectedBy ? (
                <th className="px-4 py-3 font-semibold">Rejected by</th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {parts.map((part) => (
              <tr className="border-b border-zinc-100 align-top" key={part.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-zinc-950">
                    {part.name || "Maintenance part"}
                  </div>
                  {part.maintenanceType?.name ? (
                    <div className="text-xs text-zinc-500">
                      {part.maintenanceType.name}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {part.serialNumber || ""}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  <div>{formatDate(part.expirationDate)}</div>
                  {formatMaintenanceExpiry(part) ? (
                    <div className="text-xs text-zinc-500">
                      {formatMaintenanceExpiry(part)}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  <PersonDate
                    date={part.audit?.createdAt}
                    person={part.audit?.createdById}
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  <PersonDate
                    date={part.approvedAt}
                    person={formatUser(part.approvedBy)}
                  />
                </td>
                {showRejectedBy ? (
                  <td className="px-4 py-3 text-zinc-700">
                    <PersonDate
                      date={part.rejectedAt}
                      person={formatUser(part.rejectedBy)}
                    />
                  </td>
                ) : null}
              </tr>
            ))}

            {!parts.length ? (
              <tr>
                <td
                  className="px-4 py-4 text-zinc-600"
                  colSpan={showRejectedBy ? 6 : 5}
                >
                  {emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonDate({
  date,
  person,
}: {
  date?: string | null;
  person?: string | null;
}) {
  return (
    <div>
      <div>{formatDate(date)}</div>
      {person ? (
        <div className="text-xs font-semibold text-cyan-700">{person}</div>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-700"
      : tone === "ok"
        ? "text-emerald-700"
        : "text-cyan-800";

  return (
    <div className="flex h-11 items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3">
      <span className={toneClass}>{icon}</span>

      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-500">
        {label}
      </span>

      <span className="font-mono text-sm font-bold text-zinc-950">{value}</span>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  if (!hasDisplayValue(value)) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-1.5 flex items-center gap-2 text-cyan-800">{icon}</div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </p>

      <p className="mt-0.5 truncate font-mono text-sm font-bold text-zinc-950">
        {value}
      </p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  if (!hasDisplayValue(value)) {
    return null;
  }

  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>

      <span className="min-w-0 truncate text-right font-medium text-zinc-900">
        {value}
      </span>
    </div>
  );
}

function hasActiveWarning(aircraft: FlightLoggerAircraft) {
  return Boolean(warningSummary(aircraft));
}

function warningSummary(aircraft: FlightLoggerAircraft) {
  return visibleWarning(aircraft.worstMaintenanceWarning);
}

function visibleWarning(warning?: FlightLoggerMaintenanceWarning | null) {
  if (!warning) {
    return null;
  }

  if (
    ![
      warning.color,
      warning.status,
      warning.subjectName,
      warning.expiryDate,
      warning.serialNumber,
    ].some(hasDisplayValue)
  ) {
    return null;
  }

  return warning;
}

function warningCardClass(warning: FlightLoggerMaintenanceWarning) {
  const value = `${warning.color ?? ""} ${warning.status ?? ""}`.toLowerCase();

  if (/red|expired|critical|danger|overdue/.test(value)) {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  if (/green|ok|valid|airworthy/.test(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  return "border-amber-200 bg-amber-50 text-amber-950";
}

function hasDisplayValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function formatEnum(value?: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase() : "";
}

function formatNumber(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function formatMinutes(value?: number | null) {
  return value === null || value === undefined ? "" : `${value} min`;
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) {
    return "";
  }

  const hours = Math.floor(seconds / 3600);

  const minutes = Math.round((seconds % 3600) / 60);

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString("en-GB");
}

function formatMaintenanceExpiry(part: FlightLoggerMaintenancePart) {
  const parts = [
    part.expirationCycles === null || part.expirationCycles === undefined
      ? null
      : `${part.expirationCycles} cycles`,
    part.expirationLogSeconds === null ||
    part.expirationLogSeconds === undefined
      ? null
      : formatDuration(part.expirationLogSeconds),
    part.expiresOnLog ? `on ${formatEnum(part.expiresOnLog)}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "";
}

function formatUser(
  user: FlightLoggerMaintenancePart["approvedBy"],
): string | null {
  if (!user) {
    return null;
  }

  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.callSign ||
    user.id ||
    null
  );
}
