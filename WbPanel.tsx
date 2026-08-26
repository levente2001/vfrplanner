import { useEffect, useMemo, useState } from "react";
import { Calculator, Minus, Plus } from "lucide-react";
import { CgChart } from "./CgChart";
import {
  blankProfile,
  computeWB,
  convertArm,
  convertEnvelopeArms,
  convertEnvelopeWeights,
  convertFuelAmount,
  convertFuelDensity,
  convertWeight,
  EXAMPLE_PROFILE,
  LS_KEY,
  LS_SEL,
  parseEnvelope,
  type Loads,
  type Profile,
} from "@/lib/vfr/wb";
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

const numFields: Array<{ key: keyof Profile; label: string; unit: "w" | "a" | "d" }> = [
  { key: "bew", label: "Basic empty weight", unit: "w" },
  { key: "beArm", label: "Empty CG arm", unit: "a" },
  { key: "armFront", label: "Front seats arm", unit: "a" },
  { key: "armRear", label: "Rear seats arm", unit: "a" },
  { key: "armFuel", label: "Fuel arm", unit: "a" },
  { key: "armBag1", label: "Baggage 1 arm", unit: "a" },
  { key: "armBag2", label: "Baggage 2 arm", unit: "a" },
  { key: "fuelDensity", label: "Fuel density", unit: "d" },
  { key: "maxWeight", label: "Max takeoff weight", unit: "w" },
];

function serializeEnvelope(points: Array<{ w: number; min: number; max: number }>) {
  return points
    .map((p) => [p.w, p.min, p.max].map((value) => Number(value.toFixed(3))).join(","))
    .join("\n");
}

export function WbPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([EXAMPLE_PROFILE]);
  const [currentId, setCurrentId] = useState(EXAMPLE_PROFILE.id);
  const [loads, setLoads] = useState<Loads>({
    wFront: 160,
    wRear: 0,
    wBag1: 10,
    wBag2: 0,
    fuelAmount: 90,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Profile[]) : [];
      if (Array.isArray(parsed) && parsed.length) {
        setProfiles(parsed);
        const sel = localStorage.getItem(LS_SEL);
        setCurrentId(sel && parsed.some((p) => p.id === sel) ? sel : parsed[0]!.id);
      }
    } catch {
      /* keep defaults */
    }
  }, []);

  const profile = profiles.find((p) => p.id === currentId) ?? profiles[0]!;

  function patchProfile(patch: Partial<Profile>) {
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)));
    setSaved(false);
  }

  function changeWeightUnit(nextUnit: Profile["unitWeight"]) {
    if (nextUnit === profile.unitWeight) return;
    const prevUnit = profile.unitWeight;
    patchProfile({
      unitWeight: nextUnit,
      bew: convertWeight(profile.bew, prevUnit, nextUnit),
      maxWeight: convertWeight(profile.maxWeight, prevUnit, nextUnit),
      fuelDensity: convertFuelDensity(profile.fuelDensity, prevUnit, nextUnit),
      envelope: convertEnvelopeWeights(profile.envelope, prevUnit, nextUnit),
    });
    setLoads((prev) => ({
      wFront: convertWeight(prev.wFront, prevUnit, nextUnit),
      wRear: convertWeight(prev.wRear, prevUnit, nextUnit),
      wBag1: convertWeight(prev.wBag1, prevUnit, nextUnit),
      wBag2: convertWeight(prev.wBag2, prevUnit, nextUnit),
      fuelAmount: convertFuelAmount(prev.fuelAmount, prevUnit, nextUnit),
    }));
  }

  function changeArmUnit(nextUnit: Profile["unitArm"]) {
    if (nextUnit === profile.unitArm) return;
    const prevUnit = profile.unitArm;
    patchProfile({
      unitArm: nextUnit,
      beArm: convertArm(profile.beArm, prevUnit, nextUnit),
      armFront: convertArm(profile.armFront, prevUnit, nextUnit),
      armRear: convertArm(profile.armRear, prevUnit, nextUnit),
      armFuel: convertArm(profile.armFuel, prevUnit, nextUnit),
      armBag1: convertArm(profile.armBag1, prevUnit, nextUnit),
      armBag2: convertArm(profile.armBag2, prevUnit, nextUnit),
      minCG: convertArm(profile.minCG, prevUnit, nextUnit),
      maxCG: convertArm(profile.maxCG, prevUnit, nextUnit),
      envelope: convertEnvelopeArms(profile.envelope, prevUnit, nextUnit),
    });
  }

  function persist(next: Profile[], sel: string) {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    localStorage.setItem(LS_SEL, sel);
  }

  const wb = useMemo(() => computeWB(profile, loads), [profile, loads]);

  const unitW = profile.unitWeight;
  const unitA = profile.unitArm;
  const unitFor = (u: "w" | "a" | "d") =>
    u === "w" ? unitW : u === "a" ? unitA : unitW === "lb" ? "lb/gal" : "kg/L";
  const envelopePoints = useMemo(() => parseEnvelope(profile.envelope), [profile.envelope]);

  function patchEnvelopePoint(
    index: number,
    key: "w" | "min" | "max",
    value: number,
  ) {
    const next = envelopePoints.map((point) => ({ ...point }));
    const current = next[index];
    if (!current) return;
    current[key] = value;
    patchProfile({ envelope: serializeEnvelope(next) });
  }

  function addEnvelopePoint() {
    const last = envelopePoints[envelopePoints.length - 1];
    const next = [
      ...envelopePoints,
      last
        ? { w: last.w + 100, min: last.min, max: last.max }
        : { w: profile.maxWeight || 0, min: profile.minCG, max: profile.maxCG },
    ];
    patchProfile({ envelope: serializeEnvelope(next) });
  }

  function removeEnvelopePoint(index: number) {
    const next = envelopePoints.filter((_, i) => i !== index);
    patchProfile({ envelope: serializeEnvelope(next) });
  }

  const loadFields: Array<{ key: keyof Loads; label: string; unit: string }> = [
    { key: "wFront", label: "Front seats total", unit: unitW },
    { key: "wRear", label: "Rear seats total", unit: unitW },
    { key: "wBag1", label: "Baggage 1", unit: unitW },
    { key: "wBag2", label: "Baggage 2", unit: unitW },
    { key: "fuelAmount", label: "Fuel amount", unit: unitW === "lb" ? "gal" : "L" },
  ];

  return (
    <Card id="wb" className="relative overflow-hidden">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-panel-muted px-4 py-3">
        <CardTitle className="panel-heading truncate">Weight &amp; balance</CardTitle>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const p = blankProfile();
              const next = [...profiles, p];
              setProfiles(next);
              setCurrentId(p.id);
              persist(next, p.id);
            }}
          >
            New
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              persist(profiles, profile.id);
              setSaved(true);
            }}
          >
            {saved ? "Saved" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => {
              const next = profiles.filter((p) => p.id !== profile.id);
              const list = next.length ? next : [EXAMPLE_PROFILE];
              setProfiles(list);
              setCurrentId(list[0]!.id);
              persist(list, list[0]!.id);
            }}
          >
            Delete
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-8 p-4 sm:p-6 lg:grid-cols-2 lg:gap-10">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="profileSelect">
                Profile
              </Label>
              <Select
                value={profile.id}
                onValueChange={(value) => {
                  setCurrentId(value);
                  localStorage.setItem(LS_SEL, value);
                }}
              >
                <SelectTrigger id="profileSelect">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="acName">
                Aircraft name
              </Label>
              <Input
                id="acName"
                value={profile.name}
                placeholder="e.g. HA-XXX C172"
                onChange={(e) => patchProfile({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="unitWeight">
                Weight unit
              </Label>
              <Select
                value={profile.unitWeight}
                onValueChange={(value) => changeWeightUnit(value as Profile["unitWeight"])}
              >
                <SelectTrigger id="unitWeight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="lb">lb</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="unitArm">
                Arm unit
              </Label>
              <Select
                value={profile.unitArm}
                onValueChange={(value) => changeArmUnit(value as Profile["unitArm"])}
              >
                <SelectTrigger id="unitArm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm">mm</SelectItem>
                  <SelectItem value="in">in</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="field-label mb-3">Aircraft data</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {numFields.map((f) => (
                <div key={f.key} className="min-w-0 space-y-1">
                  <Label className="field-label block truncate text-xs" htmlFor={`p-${f.key}`}>
                    {f.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`p-${f.key}`}
                      type="number"
                      step="0.01"
                      value={String(profile[f.key] ?? "")}
                      onChange={(e) =>
                        patchProfile({ [f.key]: parseFloat(e.target.value) || 0 } as Partial<Profile>)
                      }
                      className="h-8 border-0 border-b border-border px-0 py-1 font-mono shadow-none focus:border-primary"
                    />
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {unitFor(f.unit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="field-label">POH CG envelope points</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Enter chart breakpoints as airplane weight, forward CG limit, and aft CG limit.
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={addEnvelopePoint}>
                <Plus className="size-3" />
                Row
              </Button>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[520px] space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>Weight ({unitW})</span>
                  <span>FWD limit ({unitA})</span>
                  <span>AFT limit ({unitA})</span>
                  <span />
                </div>
                {envelopePoints.map((point, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={String(point.w)}
                      onChange={(e) =>
                        patchEnvelopePoint(index, "w", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 font-mono"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={String(point.min)}
                      onChange={(e) =>
                        patchEnvelopePoint(index, "min", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 font-mono"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={String(point.max)}
                      onChange={(e) =>
                        patchEnvelopePoint(index, "max", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 font-mono"
                    />
                    <Button
                      aria-label="Remove envelope point"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => removeEnvelopePoint(index)}
                    >
                      <Minus className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <p className="field-label mb-3">Loading</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {loadFields.map((f) => (
                <div key={f.key} className="min-w-0 space-y-1">
                  <Label className="field-label text-xs block truncate" htmlFor={`l-${f.key}`}>
                    {f.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`l-${f.key}`}
                      type="number"
                      step="0.1"
                      value={String(loads[f.key])}
                      onChange={(e) =>
                        setLoads((prev) => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))
                      }
                      className="h-8 border-0 border-b border-border px-0 py-1 font-mono shadow-none focus:border-primary"
                    />
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {f.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total W", value: `${wb.W.toFixed(1)} ${unitW}` },
              { label: "Moment", value: `${wb.M.toFixed(0)}` },
              { label: "CG", value: `${wb.CG.toFixed(1)} ${unitA}` },
            ].map((s) => (
              <Card key={s.label} className="min-w-0 shadow-sm">
                <CardContent className="p-3">
                <p className="field-label truncate">{s.label}</p>
                <p className="font-mono text-sm font-semibold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="min-w-0 shadow-sm">
              <CardContent className="p-3">
              <p className="field-label truncate">Status</p>
              <Badge variant={wb.withinLimits ? "secondary" : "destructive"}>
                {wb.status}
              </Badge>
              </CardContent>
            </Card>
          </div>

          <Card className="border-dashed bg-panel-muted shadow-sm">
            <CardContent className="p-3">
            <p className="field-label mb-2 flex items-center gap-2">
              <Calculator className="size-3" /> CG envelope
            </p>
            <CgChart
              cg={wb.CG}
              weight={wb.W}
              minL={wb.minL}
              maxL={wb.maxL}
              profile={profile}
              env={wb.env}
              within={wb.withinLimits}
            />
            </CardContent>
          </Card>
        </div>
      </CardContent>
      <div
        className="absolute inset-0 z-10 grid cursor-not-allowed place-items-center border border-yellow-500/25 bg-background/55 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-yellow-700/90 backdrop-blur-[1px]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0, rgba(234, 179, 8, 0.2) 8px, transparent 8px, transparent 22px)",
        }}
      >
        <span className="border rounded-xl border-yellow-500/25 bg-background/70 px-4 py-2">
          under development
        </span>
      </div>
    </Card>
  );
}
