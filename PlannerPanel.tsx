import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Plane, Minus, Plus } from "lucide-react";
import type { User } from "firebase/auth";
import {
  deleteFlightPlan,
  listFlightPlans,
  saveFlightPlan,
  type SavedFlightPlan,
} from "@/lib/firebase/flightPlans";
import {
  computeLegs,
  formatHM,
  loadAirports,
  reverseGeocodeWaypoint,
  resolveWaypoints,
  signed,
  type Airport,
  type LatLng,
  type WaypointMeta,
} from "@/lib/vfr/nav";
import type { FlightPlanSnapshot } from "@/lib/vfr/briefing";
import { exportNavlogXlsx } from "@/lib/xlsx/navlog";
import { Alert, AlertDescription } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import { Textarea } from "@/ui/textarea";

const RouteMap = lazy(() => import("./RouteMap"));
const L_TO_US_GAL = 0.2641720524;

type FuelUnit = "L" | "USG";

const fuelUnitLabel: Record<FuelUnit, string> = {
  L: "L",
  USG: "US gal",
};

function firebaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (
    message.includes("ERR_BLOCKED_BY_CLIENT") ||
    message.includes("Failed to fetch") ||
    code.includes("unavailable")
  ) {
    return "Firebase request was blocked by the browser or an extension. Allow firestore.googleapis.com, then try saving again.";
  }

  if (code.includes("permission-denied")) {
    return "Firebase denied the request. Check your Firestore security rules for this user.";
  }

  return message || "Firebase request failed.";
}

function convertFuelUnit(value: number, from: FuelUnit, to: FuelUnit) {
  if (from === to) return value;
  return from === "L" ? value * L_TO_US_GAL : value / L_TO_US_GAL;
}

function nextMapWaypointLabel(waypoints: WaypointMeta[]) {
  const used = new Set(waypoints.map((w) => w.label.toUpperCase()));
  let index = 1;
  while (used.has(`WP${index}`)) index++;
  return `WP${index}`;
}

export type RouteStats = {
  legs: number;
  ete: string;
  fuel: string;
  wind: string;
};

export function PlannerPanel({
  onStats,
  onWaypointsChange,
  onPlanChange,
  user,
}: {
  onStats: (s: RouteStats) => void;
  onWaypointsChange?: (waypoints: WaypointMeta[]) => void;
  onPlanChange?: (plan: FlightPlanSnapshot | null) => void;
  user: User | null;
}) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [showAirports, setShowAirports] = useState(true);
  const [showAirspaces, setShowAirspaces] = useState(false);
  const [waypoints, setWaypoints] = useState<WaypointMeta[]>([]);
  const [fitKey, setFitKey] = useState(0);
  const [text, setText] = useState("LHBP LHSM LHPP");
  const [tas, setTas] = useState("90");
  const [fuelFlow, setFuelFlow] = useState("8");
  const [fuelUnit, setFuelUnit] = useState<FuelUnit>("USG");
  const [windDir, setWindDir] = useState("270");
  const [windSpeed, setWindSpeed] = useState("0");
  const [variationValue, setVariationValue] = useState("6");
  const [variationDirection, setVariationDirection] = useState<"E" | "W">("E");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedFlightPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planName, setPlanName] = useState("Local flight");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadAirports().then(setAirports);
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedPlans([]);
      setSelectedPlanId("");
      return;
    }
    setLoadingPlans(true);
    listFlightPlans(user.uid)
      .then((plans) => {
        setSavedPlans(plans);
        setSelectedPlanId((current) =>
          current && plans.some((plan) => plan.id === current) ? current : "",
        );
      })
      .catch((e) => setError(firebaseErrorMessage(e)))
      .finally(() => setLoadingPlans(false));
  }, [user]);

  const numeric = useMemo(
    () => ({
      tas: parseFloat(tas) || 0,
      fuelFlow: parseFloat(fuelFlow) || 0,
      windDir: (parseFloat(windDir) || 0) % 360,
      windSpeed: parseFloat(windSpeed) || 0,
      variationValue: parseFloat(variationValue) || 0,
      variationDirection,
    }),
    [tas, fuelFlow, windDir, windSpeed, variationValue, variationDirection],
  );

  const result = useMemo(() => {
    if (waypoints.length < 2) {
      return { legs: [], totalDistance: 0, totalTime: 0, totalFuel: 0 };
    }
    return computeLegs(
      waypoints.map((w) => ({ lat: w.lat, lng: w.lon })),
      waypoints,
      numeric,
    );
  }, [waypoints, numeric]);

  useEffect(() => {
    onStats({
      legs: result.legs.length,
      ete: result.totalTime ? formatHM(result.totalTime) : "—",
      fuel: result.totalFuel
        ? `${result.totalFuel.toFixed(1)} ${fuelUnitLabel[fuelUnit]}`
        : "—",
      wind: result.legs.length
        ? `${Math.round(numeric.windDir)}° / ${Math.round(numeric.windSpeed)} kt`
        : "—",
    });
  }, [result, numeric, fuelUnit, onStats]);

  useEffect(() => {
    onWaypointsChange?.(waypoints);
  }, [waypoints, onWaypointsChange]);

  useEffect(() => {
    if (!onPlanChange) return;
    if (waypoints.length < 2 || result.legs.length === 0) {
      onPlanChange(null);
      return;
    }
    onPlanChange({
      name: planName.trim() || "Untitled flight plan",
      waypoints,
      legs: result.legs,
      totalDistanceNm: result.totalDistance,
      totalTimeHours: result.totalTime,
      totalTripFuel: result.totalFuel,
      tas: numeric.tas,
      fuelFlow: numeric.fuelFlow,
      fuelUnit,
      windDirection: numeric.windDir,
      windSpeed: numeric.windSpeed,
      variationValue: numeric.variationValue,
      variationDirection,
    });
  }, [
    onPlanChange,
    waypoints,
    result,
    planName,
    numeric,
    fuelUnit,
    variationDirection,
  ]);

  const addWaypoint = useCallback((wp: WaypointMeta) => {
    setWaypoints((prev) => [
      ...prev,
      {
        ...wp,
        label: wp.label === "WP" ? nextMapWaypointLabel(prev) : wp.label,
        source: "map",
      },
    ]);
  }, []);

  const moveWaypoint = useCallback((index: number, pos: LatLng) => {
    const movedWaypoint = waypoints[index];
    const replacedInputIndex =
      movedWaypoint?.source === "input"
        ? movedWaypoint.inputIndex
        : movedWaypoint?.replacedInputIndex;
    setWaypoints((prev) =>
      prev.map((w, i) => {
        if (i !== index) return w;
        return {
          ...w,
          lat: pos.lat,
          lon: pos.lng,
          source: "map",
          replacedInputIndex,
        };
      }),
    );
    void reverseGeocodeWaypoint(pos).then((resolved) => {
      if (!resolved) return;
      setWaypoints((prev) =>
        prev.map((w, i) => {
          if (
            i !== index ||
            Math.abs(w.lat - pos.lat) > 0.000001 ||
            Math.abs(w.lon - pos.lng) > 0.000001
          ) {
            return w;
          }
          return {
            ...w,
            label: resolved.label,
            name: resolved.name,
            source: "map",
            replacedInputIndex: w.replacedInputIndex ?? replacedInputIndex,
          };
        }),
      );
    });
  }, [waypoints]);

  const removeWaypoint = useCallback((index: number) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorderWaypoint = useCallback((index: number, direction: -1 | 1) => {
    setWaypoints((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (!item) return prev;
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const changeFuelUnit = useCallback((nextUnit: FuelUnit) => {
    setFuelFlow((current) => {
      const value = parseFloat(current);
      if (!Number.isFinite(value)) return current;
      return convertFuelUnit(value, fuelUnit, nextUnit).toFixed(1);
    });
    setFuelUnit(nextUnit);
  }, [fuelUnit]);

  function validate() {
    if (!text.trim() && waypoints.length < 2) {
      return "Enter at least two waypoints or place at least two markers on the map.";
    }
    if (!tas.trim() || numeric.tas <= 0) return "Cruise TAS must be greater than 0.";
    if (!fuelFlow.trim() || numeric.fuelFlow < 0) return "Fuel consumption cannot be negative.";
    if (!windDir.trim() || parseFloat(windDir) < 0 || parseFloat(windDir) > 360)
      return "Wind direction must be between 0 and 360 degrees.";
    if (!windSpeed.trim() || numeric.windSpeed < 0) return "Wind speed cannot be negative.";
    if (
      !variationValue.trim() ||
      numeric.variationValue < 0 ||
      numeric.variationValue > 180
    ) {
      return "Declination must be between 0 and 180 degrees.";
    }
    if (variationDirection !== "E" && variationDirection !== "W") {
      return "Select East or West declination direction.";
    }
    return "";
  }

  async function calculate() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    try {
      const mapWaypoints = waypoints.filter((w) => w.source === "map");
      if (!text.trim()) {
        if (mapWaypoints.length < 2) throw new Error("Place at least two map waypoints.");
        setWaypoints(mapWaypoints);
        setFitKey((k) => k + 1);
        return;
      }
      const list = airports.length ? airports : await loadAirports();
      if (!airports.length) setAirports(list);
      const replacedInputIndexes = new Set(
        mapWaypoints
          .map((wp) => wp.replacedInputIndex)
          .filter((value): value is number => typeof value === "number"),
      );
      const inputWaypoints = (await resolveWaypoints(text, list))
        .map((wp, inputIndex) => ({
          ...wp,
          inputIndex,
          source: "input" as const,
        }))
        .filter((wp) => !replacedInputIndexes.has(wp.inputIndex));
      const inputByIndex = new Map(inputWaypoints.map((wp) => [wp.inputIndex, wp]));
      const usedInputIndexes = new Set<number>();
      const hasInputWaypoints = waypoints.some((wp) => wp.source === "input");
      const combinedWaypoints = hasInputWaypoints
        ? waypoints
            .map((wp) => {
              if (wp.source === "input" && typeof wp.inputIndex === "number") {
                const resolved = inputByIndex.get(wp.inputIndex);
                if (!resolved) return null;
                usedInputIndexes.add(wp.inputIndex);
                return resolved;
              }
              return wp.source === "map" ? wp : null;
            })
            .filter((wp): wp is WaypointMeta => Boolean(wp))
        : [...inputWaypoints, ...mapWaypoints];
      if (hasInputWaypoints) {
        for (const wp of inputWaypoints) {
          if (!usedInputIndexes.has(wp.inputIndex)) combinedWaypoints.push(wp);
        }
      }
      if (combinedWaypoints.length < 2) {
        throw new Error("Enter at least two waypoints or add them on the map.");
      }
      setWaypoints(combinedWaypoints);
      setFitKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Route calculation failed.");
    }
  }

  async function exportNavlog() {
    if (!result.legs.length) {
      setError("Calculate a route before exporting the navigation log.");
      return;
    }
    setError("");
    setExporting(true);
    try {
      await exportNavlogXlsx({
        waypoints,
        legs: result.legs,
        totalDistance: result.totalDistance,
        totalTime: result.totalTime,
        totalFuel: result.totalFuel,
        fuelUnit,
        fuelUnitLabel: fuelUnitLabel[fuelUnit],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Navigation log export failed.");
    } finally {
      setExporting(false);
    }
  }

  function currentFlightPlanPayload() {
    return {
      name: planName.trim() || "Untitled flight plan",
      waypointText: text,
      waypoints,
      tas,
      fuelFlow,
      fuelUnit,
      windDir,
      windSpeed,
      variationValue,
      variationDirection,
    };
  }

  async function saveCurrentFlightPlan() {
    if (!user) {
      setError("Login before saving flight plans.");
      return;
    }
    setError("");
    setSavingPlan(true);
    try {
      const id = await saveFlightPlan(user.uid, currentFlightPlanPayload(), selectedPlanId || null);
      const plans = await listFlightPlans(user.uid);
      setSavedPlans(plans);
      setSelectedPlanId(id);
    } catch (e) {
      setError(firebaseErrorMessage(e));
    } finally {
      setSavingPlan(false);
    }
  }

  function loadFlightPlan(planId: string) {
    const plan = savedPlans.find((item) => item.id === planId);
    if (!plan) return;
    setSelectedPlanId(plan.id);
    setPlanName(plan.name);
    setText(plan.waypointText);
    setWaypoints(plan.waypoints);
    setTas(plan.tas);
    setFuelFlow(plan.fuelFlow);
    setFuelUnit(plan.fuelUnit);
    setWindDir(plan.windDir);
    setWindSpeed(plan.windSpeed);
    setVariationValue(plan.variationValue);
    setVariationDirection(plan.variationDirection);
    setFitKey((k) => k + 1);
  }

  async function deleteCurrentFlightPlan() {
    if (!user || !selectedPlanId) return;
    setError("");
    try {
      await deleteFlightPlan(user.uid, selectedPlanId);
      const plans = await listFlightPlans(user.uid);
      setSavedPlans(plans);
      setSelectedPlanId("");
    } catch (e) {
      setError(firebaseErrorMessage(e));
    }
  }

  return (
    <section id="planner" className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:space-y-6 xl:col-span-2">
        <Card className="flex h-[380px] flex-col overflow-hidden sm:h-[460px] xl:h-[500px]">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-panel-muted px-3 py-2.5">
            <CardTitle className="panel-heading truncate">Navigation map</CardTitle>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
              <Label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showAirspaces}
                  onChange={(e) => setShowAirspaces(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Airspaces
              </Label>
              <Label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showAirports}
                  onChange={(e) => setShowAirports(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                ICAO airports
              </Label>
            </div>
          </CardHeader>
          <div className="relative flex-1">
            {mounted ? (
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center bg-panel-muted">
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      Loading chart layer
                    </span>
                  </div>
                }
              >
                <RouteMap
                  waypoints={waypoints}
                  airports={airports}
                  showAirports={showAirports}
                  showAirspaces={showAirspaces}
                  onAddWaypoint={addWaypoint}
                  onMoveWaypoint={moveWaypoint}
                  onRemoveWaypoint={removeWaypoint}
                  fitKey={fitKey}
                />
              </Suspense>
            ) : (
              <div className="h-full bg-panel-muted" />
            )}
          </div>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Click the map to add a waypoint, drag to move, right-click to remove. Airspaces use
            unofficial OpenAIR data; check official publications.
          </p>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border bg-panel-muted px-4 py-2.5">
            <CardTitle className="panel-heading">Leg breakdown</CardTitle>
          </CardHeader>
          {result.legs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Set at least two waypoints, then calculate the route.
            </p>
          ) : (
            <Table className="text-left">
              <TableHeader>
                  <TableRow className="border-b border-border bg-panel-muted">
                    {[
                      "Leg",
                      "Distance",
                      "TC",
                      "MC",
                      "WCA",
                      "MH",
                      "GS",
                      "ETE",
                      "Trip fuel",
                    ].map((h) => (
                      <TableHead
                        key={h}
                        className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border font-mono text-xs">
                  {result.legs.map((leg, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap px-3 py-2.5 font-medium">
                        {leg.from} → {leg.to}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        {leg.distance.toFixed(1)} NM
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-primary">{leg.trueCourse.toFixed(0)}°</TableCell>
                      <TableCell className="px-3 py-2.5 text-primary">
                        {leg.magneticCourse.toFixed(0)}°
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground">{signed(leg.wca)}°</TableCell>
                      <TableCell className="px-3 py-2.5 text-primary">
                        {leg.magneticHeading.toFixed(0)}°
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground">
                        {leg.groundSpeed === null ? "—" : `${leg.groundSpeed.toFixed(0)} kt`}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground">
                        {leg.ete === null ? leg.error : `${Math.round(leg.ete * 60)} min`}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground">
                        {leg.fuel === null
                          ? "—"
                          : `${leg.fuel.toFixed(1)} ${fuelUnitLabel[fuelUnit]}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-panel-muted font-semibold">
                  <TableRow>
                    <TableCell className="px-2 py-2.5">Total</TableCell>
                    <TableCell className="px-2 py-2.5">{result.totalDistance.toFixed(1)} NM</TableCell>
                    <TableCell className="px-2 py-2.5" colSpan={3}>
                      {numeric.variationValue.toFixed(1)}° {variationDirection}
                    </TableCell>
                    <TableCell className="px-2 py-2.5" />
                    <TableCell className="px-2 py-2.5" />
                    <TableCell className="px-2 py-2.5">{Math.round(result.totalTime * 60)} min</TableCell>
                    <TableCell className="px-2 py-2.5">
                      {result.totalFuel.toFixed(1)} {fuelUnitLabel[fuelUnit]}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
          )}
        </Card>
      </div>

      <aside className="min-w-0 space-y-4 lg:space-y-6">
        <Card>
          <CardHeader className="pb-0 px-5">
            <CardTitle className="panel-heading">Flight parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
          <div className="space-y-4">
            <div className="space-y-3 border-b border-border pb-4">
              <div className="space-y-2">
                <Label className="flight-label" htmlFor="planName">
                  Flight plan name
                </Label>
                <Input
                  id="planName"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="flight-input"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                  value={selectedPlanId || "none"}
                  onValueChange={(value) => {
                    if (value === "none") {
                      setSelectedPlanId("");
                      return;
                    }
                    loadFlightPlan(value);
                  }}
                  disabled={!user || loadingPlans}
                >
                  <SelectTrigger className="flight-input">
                    <SelectValue placeholder={user ? "Saved flight plans" : "Login to load plans"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {user ? "New flight plan" : "Login required"}
                    </SelectItem>
                    {savedPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveCurrentFlightPlan}
                    disabled={!user || savingPlan}
                  >
                    {savingPlan ? "Saving" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={deleteCurrentFlightPlan}
                    disabled={!user || !selectedPlanId}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {!user && (
                <p className="flight-help">Login or register to save flight plans to Firebase.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="flight-label" htmlFor="waypoints">
                Waypoints
              </Label>
              <Textarea
                id="waypoints"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="flight-textarea resize-none"
                placeholder={"LHBP LHSM LHPP\nBudapest; Szeged\n47.4394,19.2619"}
              />
              <p className="flight-help">
                ICAO codes, decimal coordinates or settlement names. Use a new line or semicolon
                for multi-word places.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flight-label" htmlFor="tas">
                  Cruise TAS (kt)
                </Label>
                <Input
                  id="tas"
                  type="number"
                  value={tas}
                  onChange={(e) => setTas(e.target.value)}
                  className="flight-input"
                />
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  className="flight-label-fuelflow text-left text-primary cursor-pointer"
                  onClick={() => changeFuelUnit(fuelUnit === "L" ? "USG" : "L")}
                >
                  F.f. ({fuelUnitLabel[fuelUnit]}/h)
                </button>
                <Input
                  id="ff"
                  type="number"
                  value={fuelFlow}
                  onChange={(e) => setFuelFlow(e.target.value)}
                  className="flight-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="flight-label" htmlFor="wdir">
                  Wind dir (°)
                </Label>
                <Input
                  id="wdir"
                  type="number"
                  value={windDir}
                  onChange={(e) => setWindDir(e.target.value)}
                  className="flight-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="flight-label" htmlFor="wspd">
                  Wind speed (kt)
                </Label>
                <Input
                  id="wspd"
                  type="number"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(e.target.value)}
                  className="flight-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="flight-label" htmlFor="variationValue">
                  Declination (°)
                </Label>
                <Input
                  id="variationValue"
                  type="number"
                  min="0"
                  max="180"
                  step="0.1"
                  value={variationValue}
                  onChange={(e) => setVariationValue(e.target.value)}
                  className="flight-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="flight-label" htmlFor="variationDirection">
                  Direction
                </Label>
                <Select
                  value={variationDirection}
                  onValueChange={(value) => setVariationDirection(value as "E" | "W")}
                >
                  <SelectTrigger id="variationDirection" className="flight-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="E">East</SelectItem>
                    <SelectItem value="W">West</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="flight-help">
              Enter the declination magnitude, then select East or West. East is subtracted from
              true direction; West is added.
            </p>
            <Button className="w-full" onClick={calculate}>
              <Plane className="size-4" />
              Calculate route
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={exportNavlog}
              disabled={!result.legs.length || exporting}
            >
              <Download className="size-4" />
              {exporting ? "Exporting navlog" : "Export navlog"}
            </Button>
            {error && (
              <Alert variant="destructive" id="routeAlert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0 px-5">
            <CardTitle className="panel-heading">Waypoints</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
          {waypoints.length === 0 ? (
            <p className="text-xs text-muted-foreground">No waypoints set.</p>
          ) : (
            <ul className="divide-y divide-border">
              {waypoints.map((w, i) => (
                <li
                  key={`${w.label}-${i}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium">{w.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {w.lat.toFixed(3)}, {w.lon.toFixed(3)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={`Move ${w.label} up`}
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={i === 0}
                      onClick={() => reorderWaypoint(i, -1)}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      aria-label={`Move ${w.label} down`}
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={i === waypoints.length - 1}
                      onClick={() => reorderWaypoint(i, 1)}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                    <Button
                      aria-label={`Remove ${w.label}`}
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => removeWaypoint(i)}
                    >
                      <Minus className="size-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Badge variant="outline" className="mt-3 gap-2">
            <Plus className="size-3 shrink-0" /> Click the map or an airport dot to add more.
          </Badge>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}
