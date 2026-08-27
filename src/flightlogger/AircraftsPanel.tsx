import { useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  AlertTriangle,
  Clock3,
  Fuel,
  Gauge,
  KeyRound,
  MapPin,
  Plane,
  RefreshCcw,
  Search,
  Wrench,
} from "lucide-react";
import { useAircrafts } from "./api/aircrafts";
import { FlightLoggerGate, useFlightLoggerToken } from "./components/AuthGate";
import type {
  FlightLoggerAircraft,
  FlightLoggerMaintenanceWarning,
  FlightLoggerMaintenancePart,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const aircraftQuery = useAircrafts(apiToken, search);
  const aircraft = useMemo(
    () => aircraftQuery.data?.aircraft ?? [],
    [aircraftQuery.data?.aircraft],
  );
  const selectedAircraft = useMemo(
    () =>
      aircraft.find((item) => item.id === selectedId) ?? aircraft[0] ?? null,
    [aircraft, selectedId],
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-700 text-white">
              <Plane size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-zinc-950 sm:text-lg">
                FlightLogger Aircrafts
              </h1>
              <p className="truncate text-xs text-zinc-600">
                {aircraft.length} aircraft
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
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 disabled:opacity-50"
              onClick={() => aircraftQuery.refetch()}
              disabled={aircraftQuery.isFetching}
              aria-label="Refresh aircraft"
              title="Refresh"
            >
              <RefreshCcw
                size={18}
                className={aircraftQuery.isFetching ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 md:px-5">
        <section className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 size-5 text-zinc-400" />
            <input
              className="h-11 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by callsign, model, or class"
              aria-label="Search aircraft"
            />
          </label>
          <MetricCard
            icon={<Wrench size={18} />}
            label="Maintenance items"
            value={String(
              aircraft.reduce(
                (count, item) => count + item.maintenanceParts.length,
                0,
              ),
            )}
          />
          <MetricCard
            icon={<AlertTriangle size={18} />}
            label="Disabled"
            value={String(aircraft.filter((item) => item.disabled).length)}
          />
        </section>

        {aircraftQuery.isError ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {aircraftQuery.error instanceof Error
              ? aircraftQuery.error.message
              : "Unable to load aircraft."}
          </div>
        ) : null}

        {aircraftQuery.isLoading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            Loading aircraft...
          </div>
        ) : null}

        {aircraftQuery.data?.warning ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {aircraftQuery.data.warning}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="space-y-2">
            {aircraft.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-cyan-600 ${
                  selectedAircraft?.id === item.id
                    ? "border-cyan-700 ring-2 ring-cyan-700/20"
                    : "border-zinc-200"
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-zinc-950">
                      {item.callSign}
                    </p>
                    <p className="truncate text-sm text-zinc-600">
                      {item.model}
                    </p>
                  </div>
                  <StatusBadge disabled={item.disabled} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600">
                  <span>{formatEnum(item.aircraftClass)}</span>
                  <span>{formatEnum(item.aircraftType)}</span>
                  <span>{item.homeAirport?.name ?? "No home base"}</span>
                  <span>{item.maintenanceParts.length} maintenance</span>
                </div>
              </button>
            ))}
            {!aircraftQuery.isLoading && !aircraft.length ? (
              <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600">
                No aircraft found.
              </div>
            ) : null}
          </section>

          <section className="min-w-0">
            {selectedAircraft ? (
              <AircraftDetails aircraft={selectedAircraft} />
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
                Select an aircraft to view details.
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function AircraftDetails({ aircraft }: { aircraft: FlightLoggerAircraft }) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-800">
              Aircraft details
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-950">
              {aircraft.callSign}
            </h2>
            <p className="text-sm text-zinc-600">{aircraft.model}</p>
          </div>
          <StatusBadge disabled={aircraft.disabled} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoTile
            icon={<Gauge size={18} />}
            label="Timer"
            value={formatDuration(aircraft.timerSeconds)}
          />
          <InfoTile
            icon={<Clock3 size={18} />}
            label="Airborne"
            value={formatMinutes(aircraft.totalAirborneMinutes)}
          />
          <InfoTile
            icon={<Fuel size={18} />}
            label="Fuel"
            value={formatNumber(aircraft.totalFuel)}
          />
          <InfoTile
            icon={<MapPin size={18} />}
            label="Home base"
            value={aircraft.homeAirport?.name ?? "-"}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DetailCard title="Core data">
          <KeyValue label="ID" value={aircraft.id} />
          <KeyValue label="Class" value={formatEnum(aircraft.aircraftClass)} />
          <KeyValue label="Type" value={formatEnum(aircraft.aircraftType)} />
          <KeyValue
            label="Engine"
            value={formatEnum(aircraft.defaultEngineType)}
          />
          <KeyValue
            label="Default PMF"
            value={formatEnum(aircraft.defaultPMF)}
          />
          <KeyValue
            label="Current airport"
            value={aircraft.currentAirport?.name ?? "-"}
          />
          <KeyValue
            label="Taxi in"
            value={formatMinutes(aircraft.taxiInTime)}
          />
          <KeyValue
            label="Taxi out"
            value={formatMinutes(aircraft.taxiOutTime)}
          />
          <KeyValue
            label="Landings"
            value={formatNumber(aircraft.totalLandings)}
          />
        </DetailCard>

        <DetailCard title="Next service">
          <KeyValue
            label="Date"
            value={formatDate(aircraft.nextService?.nextServiceDate)}
          />
          <KeyValue
            label="Cycles"
            value={formatNumber(aircraft.nextService?.nextServiceCycles)}
          />
          <KeyValue
            label="Primary"
            value={formatNumber(aircraft.nextService?.nextPrimaryService)}
          />
          <KeyValue
            label="Secondary"
            value={formatNumber(aircraft.nextService?.nextSecondaryService)}
          />
          <KeyValue
            label="Tertiary"
            value={formatNumber(aircraft.nextService?.nextTertiaryService)}
          />
          <WarningColor
            label="Date warning"
            color={aircraft.nextService?.dateWarningColor}
          />
          <WarningColor
            label="Cycles warning"
            color={aircraft.nextService?.cyclesWarningColor}
          />
        </DetailCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <WarningCard
          title="Worst maintenance warning"
          warning={aircraft.worstMaintenanceWarning}
        />
        <WarningCard title="Worst warning" warning={aircraft.worstWarning} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <LogCard title="Primary log" log={aircraft.primaryLog} />
        <LogCard title="Secondary log" log={aircraft.secondaryLog} />
        <LogCard title="Tertiary log" log={aircraft.tertiaryLog} />
      </section>

      <DetailCard title="Maintenance and discrepancies">
        <div className="space-y-3">
          {aircraft.maintenanceParts.map((part) => (
            <MaintenanceItem key={part.id ?? part.name} part={part} />
          ))}
          {!aircraft.maintenanceParts.length ? (
            <p className="text-sm text-zinc-600">
              No maintenance parts or discrepancies were returned by the API.
            </p>
          ) : null}
        </div>
      </DetailCard>

      <DetailCard title="Raw API data">
        <pre className="max-h-[420px] overflow-auto rounded-lg bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
          {JSON.stringify(aircraft.raw, null, 2)}
        </pre>
      </DetailCard>
    </div>
  );
}

function WarningCard({
  title,
  warning,
}: {
  title: string;
  warning?: FlightLoggerMaintenanceWarning | null;
}) {
  return (
    <DetailCard title={title}>
      {warning ? (
        <>
          <WarningColor label="Color" color={warning.color} />
          <KeyValue label="Subject" value={warning.subjectName ?? "-"} />
          <KeyValue label="Status" value={warning.status ?? "-"} />
          <KeyValue label="Days left" value={formatNumber(warning.daysLeft)} />
          <KeyValue
            label="Cycles left"
            value={formatNumber(warning.cyclesLeft)}
          />
          <KeyValue label="Time left" value={formatNumber(warning.timeLeft)} />
          <KeyValue label="Expiry date" value={warning.expiryDate ?? "-"} />
          <KeyValue label="Serial no." value={warning.serialNumber ?? "-"} />
          <KeyValue
            label="Requirers"
            value={warning.requirers?.join(", ") ?? "-"}
          />
        </>
      ) : (
        <p className="text-sm text-zinc-600">No warning returned.</p>
      )}
    </DetailCard>
  );
}

function MaintenanceItem({ part }: { part: FlightLoggerMaintenancePart }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-950">{part.name ?? "Item"}</p>
          <p className="text-xs text-zinc-500">
            {part.maintenanceType?.name ?? "Maintenance"}
          </p>
        </div>
        <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
          {formatEnum(part.status)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <KeyValue label="Serial no." value={part.serialNumber ?? "-"} />
        <KeyValue
          label="Expiration date"
          value={formatDate(part.expirationDate)}
        />
        <KeyValue
          label="Expiration cycles"
          value={formatNumber(part.expirationCycles)}
        />
        <KeyValue
          label="Expiration log"
          value={formatDuration(part.expirationLogSeconds)}
        />
      </div>
    </div>
  );
}

function LogCard({
  title,
  log,
}: {
  title: string;
  log: FlightLoggerAircraft["primaryLog"];
}) {
  return (
    <DetailCard title={title}>
      {log ? (
        <>
          <KeyValue label="Type" value={formatEnum(log.type)} />
          <KeyValue
            label="Measurement"
            value={formatEnum(log.measurementType)}
          />
          <KeyValue label="Total" value={formatDuration(log.totalSeconds)} />
          <KeyValue
            label="Warning"
            value={
              log.durationWarningPercent === null ||
              log.durationWarningPercent === undefined
                ? "-"
                : `${log.durationWarningPercent}%`
            }
          />
        </>
      ) : (
        <p className="text-sm text-zinc-600">Not configured.</p>
      )}
    </DetailCard>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex h-11 items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3">
      <span className="text-cyan-800">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">
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
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-cyan-800">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-bold text-zinc-950">
        {value}
      </p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="min-w-0 break-words font-medium text-zinc-900">
        {value || "-"}
      </span>
    </div>
  );
}

function WarningColor({
  label,
  color,
}: {
  label: string;
  color?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="inline-flex items-center gap-2 font-medium text-zinc-900">
        <span
          className="h-3 w-3 rounded-full border border-zinc-200"
          style={{ backgroundColor: color ?? "#e4e4e7" }}
        />
        {color ?? "-"}
      </span>
    </div>
  );
}

function StatusBadge({ disabled }: { disabled?: boolean }) {
  return (
    <span
      className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
        disabled
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {disabled ? "Disabled" : "Active"}
    </span>
  );
}

function formatEnum(value?: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase() : "-";
}

function formatNumber(value?: number | null) {
  return value === null || value === undefined ? "-" : String(value);
}

function formatMinutes(value?: number | null) {
  return value === null || value === undefined ? "-" : `${value} min`;
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString("en-GB");
}
