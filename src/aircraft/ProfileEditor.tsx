import { useState } from "react";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { AircraftField, AircraftSelect } from "./fields";
import { csvHeader, parsePerformanceCsv, profileCsv } from "./performance";
import type { Aircraft, PerformanceProfile } from "./types";

export function ProfileEditor({
  aircraft,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  aircraft: Aircraft;
  initial?: PerformanceProfile;
  busy: boolean;
  onSave: (profile: PerformanceProfile) => Promise<void>;
  onCancel: () => void;
}) {
  const [profile, setProfile] = useState<PerformanceProfile>(
    () =>
      initial ?? {
        id: crypto.randomUUID(),
        name: "",
        phase: "takeoff",
        documentId: aircraft.documents[0]?.id ?? "",
        source: "",
        configuration: "",
        surface: "paved",
        condition: "dry",
        obstacleHeightFt: 50,
        interpolation: "exact",
        verified: false,
        points: [],
      },
  );
  const [csv, setCsv] = useState(
    initial ? profileCsv(initial) : csvHeader + "\n",
  );
  const [error, setError] = useState("");
  function update<K extends keyof PerformanceProfile>(
    key: K,
    value: PerformanceProfile[K],
  ) {
    setProfile((current) => {
      const next = { ...current, [key]: value, verified: false };
      if (key === "documentId" && value !== current.documentId)
        delete next.extraction;
      return next;
    });
  }
  async function save() {
    setError("");
    try {
      if (
        !profile.name.trim() ||
        !profile.source.trim() ||
        !profile.configuration.trim()
      )
        throw new Error(
          "Enter a name, POH revision/page and aircraft configuration.",
        );
      if (
        !aircraft.documents.some(
          (document) => document.id === profile.documentId,
        )
      )
        throw new Error("Select the source POH document.");
      if (
        !Number.isFinite(profile.obstacleHeightFt) ||
        profile.obstacleHeightFt <= 0
      )
        throw new Error("Enter the obstacle height used by this POH table.");
      const points = parsePerformanceCsv(csv);
      await onSave({ ...profile, points });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profile save failed.");
    }
  }
  return (
    <div className="space-y-4 rounded-md border border-border bg-panel-muted/40 p-4">
      <h3 className="font-semibold">
        {initial ? "Edit" : "Add"} POH performance profile
      </h3>
      {profile.extraction && (
        <div className="space-y-2 rounded-md border border-primary/30 p-3 text-xs">
          <p className="font-semibold">
            AI-generated profile · {profile.extraction.method} readings · PDF
            pages {profile.extraction.pages.join(", ")}
          </p>
          <p>
            {profile.extraction.model} ·{" "}
            {new Date(profile.extraction.createdAt).toLocaleDateString()}
          </p>
          {profile.extraction.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
          <details>
            <summary className="cursor-pointer font-semibold">
              Original extraction evidence (before manual edits)
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              {profile.extraction.rowEvidence.map((evidence, index) => (
                <li key={index}>{evidence}</li>
              ))}
            </ol>
          </details>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Transcribe an applicable table from this aircraft’s POH. Each profile
        covers one configuration, surface and runway condition. All distances
        are metres, weight is kg, altitude is ft, temperature is °C and wind is
        kt. Convert source units before entering data.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <AircraftField
            label="Profile name"
            value={profile.name}
            onChange={(v) => update("name", v)}
            placeholder="Short-field takeoff"
          />
          <AircraftSelect
            label="Phase"
            value={profile.phase}
            onChange={(v) => update("phase", v as PerformanceProfile["phase"])}
          >
            <option value="takeoff">Takeoff</option>
            <option value="landing">Landing</option>
          </AircraftSelect>
          <AircraftSelect
            label="Source document"
            value={profile.documentId}
            onChange={(v) => update("documentId", v)}
          >
            <option value="">Select a document</option>
            {aircraft.documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.name}
              </option>
            ))}
          </AircraftSelect>
          <AircraftField
            label="POH revision / page / table"
            value={profile.source}
            onChange={(v) => update("source", v)}
          />
          <AircraftField
            label="Configuration / technique / limitations"
            value={profile.configuration}
            onChange={(v) => update("configuration", v)}
            placeholder="Flaps, power, technique, applicable limitations"
          />
          <AircraftField
            label="Obstacle height (ft)"
            type="number"
            value={String(profile.obstacleHeightFt)}
            onChange={(v) => update("obstacleHeightFt", Number(v))}
          />
          <AircraftSelect
            label="Surface"
            value={profile.surface}
            onChange={(v) =>
              update("surface", v as PerformanceProfile["surface"])
            }
          >
            <option value="paved">Paved</option>
            <option value="grass">Grass</option>
            <option value="other">Other (describe in configuration)</option>
          </AircraftSelect>
          <AircraftSelect
            label="Runway condition"
            value={profile.condition}
            onChange={(v) =>
              update("condition", v as PerformanceProfile["condition"])
            }
          >
            <option value="dry">Dry</option>
            <option value="wet">Wet</option>
            <option value="other">Other (describe in configuration)</option>
          </AircraftSelect>
          <AircraftSelect
            label="POH calculation method"
            value={profile.interpolation}
            onChange={(v) =>
              update("interpolation", v as PerformanceProfile["interpolation"])
            }
          >
            <option value="exact">Exact tabulated conditions only</option>
            <option value="linear">
              Linear interpolation permitted by this POH
            </option>
          </AircraftSelect>
        </div>
        <div className="space-y-2">
          <label
            className="field-label block"
            htmlFor={`profile-data-${profile.id}`}
          >
            POH data (CSV)
          </label>
          <Textarea
            id={`profile-data-${profile.id}`}
            className="min-h-40 font-mono text-xs"
            value={csv}
            spellCheck={false}
            onChange={(event) => {
              setCsv(event.target.value);
              update("verified", false);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Positive headwindKt = headwind; negative = tailwind. Positive
            slopePercent = uphill in the direction of travel. distanceM = total
            distance over the stated obstacle. Leave accelerateStopM empty if
            the POH does not provide it; it is never inferred from ground roll.
            Interpolation requires all surrounding grid rows and never
            extrapolates.
          </p>
          <label className="block text-xs">
            Import CSV
            <input
              className="mt-1 block w-full text-xs"
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 2 * 1024 * 1024)
                    throw new Error("CSV limit: 2 MB.");
                  const text = await file.text();
                  parsePerformanceCsv(text);
                  setCsv(text);
                  update("verified", false);
                  setError("");
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "CSV import failed.",
                  );
                }
              }}
            />
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={profile.verified}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                verified: event.target.checked,
              }))
            }
          />
          I checked the data, units, conditions and interpolation method against
          this aircraft’s POH. Enable this profile for calculations.
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" onClick={() => void save()}>
            Save profile
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
