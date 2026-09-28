import { useEffect, useRef, useState } from "react";
import { FileSearch, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/ui/button";
import { AircraftField } from "./fields";
import { getFirebaseServices } from "@/lib/firebase/client";
import { documentUrl } from "./repository";
import { groupPohPages, parsePageSelection } from "./pohAnalysis";
import { openPoh, renderPohPage, type OpenPoh } from "./pohPdf";
import type { PohExtractionResult } from "./pohExtraction";
import type { Aircraft, AircraftDocument, PerformanceProfile } from "./types";

export default function PohImporter({
  uid,
  aircraft,
  document,
  file,
  onSave,
  onClose,
  onBusy,
}: {
  uid: string;
  aircraft: Aircraft;
  document: AircraftDocument;
  file?: File;
  onSave: (profiles: PerformanceProfile[]) => Promise<void>;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const loadedRef = useRef<OpenPoh | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [loaded, setLoaded] = useState<OpenPoh | null>(null);
  const [pageSelection, setPageSelection] = useState("");
  const [progress, setProgress] = useState("Opening POH…");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [profiles, setProfiles] = useState<PerformanceProfile[]>([]);
  const [saved, setSaved] = useState(false);
  const [identity, setIdentity] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    onBusy(true);
    void (async () => {
      try {
        let blob: Blob = file!;
        if (!blob) {
          setProgress("Downloading POH for analysis…");
          const url = await documentUrl(uid, document);
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok)
            throw new Error(
              "Could not download the POH. Check document access and Storage CORS configuration.",
            );
          blob = await response.blob();
        }
        const next = await openPoh(blob, controller.signal, setProgress);
        if (controller.signal.aborted) {
          next.destroy();
          return;
        }
        loadedRef.current = next;
        setLoaded(next);
        const candidates = next.pages.filter((page) => page.group);
        setPageSelection(
          candidates
            .slice(0, 24)
            .map((page) => page.page)
            .join(", "),
        );
        setProgress(
          `${next.pages.length} pages scanned · ${candidates.length} candidate performance pages`,
        );
        if (!candidates.length)
          setWarnings([
            "No chart pages were identified in the PDF text layer. Enter the PDF page numbers containing the takeoff/landing charts; the image reader also handles scanned pages.",
          ]);
        if (candidates.length > 24)
          setWarnings([
            "More than 24 candidate pages found. Review the selected pages and process additional sections separately.",
          ]);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not read this PDF.",
          );
      } finally {
        if (!controller.signal.aborted) {
          setWorking(false);
          onBusy(false);
        }
      }
    })();
    return () => {
      controller.abort();
      loadedRef.current?.destroy();
      loadedRef.current = null;
      onBusy(false);
    };
    // Document/file are fixed for the lifetime of this keyed importer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, document.id]);

  async function api(method: "GET" | "POST", body?: unknown) {
    const user = getFirebaseServices()?.auth.currentUser;
    if (!user || user.uid !== uid)
      throw new Error("Sign in again before processing the POH.");
    const token = await user.getIdToken();
    const response = await fetch("/api/poh-import", {
      method,
      signal: controllerRef.current?.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result)
      throw new Error(
        result?.error || `POH processing HTTP ${response.status}.`,
      );
    return result;
  }

  async function createProfiles() {
    if (!loaded || !controllerRef.current) return;
    const signal = controllerRef.current.signal;
    setError("");
    setSaved(false);
    setProfiles([]);
    setWarnings([]);
    setWorking(true);
    onBusy(true);
    const output: PerformanceProfile[] = [];
    const messages: string[] = [];
    try {
      const numbers = parsePageSelection(pageSelection, loaded.pages.length);
      const selected = loaded.pages.filter((page) =>
        numbers.includes(page.page),
      );
      setProgress("Checking POH processing service…");
      await api("GET");
      const batches = groupPohPages(selected);
      const contextPages = [
        ...loaded.pages.slice(0, 4),
        ...loaded.pages
          .filter((page) =>
            /introduction.*performance|performance.*flight planning|5\.1.*general/i.test(
              page.text,
            ),
          )
          .slice(0, 2),
      ];
      const context = contextPages
        .map((page) => `PDF page ${page.page}: ${page.text}`)
        .join("\n")
        .slice(0, 14000);
      for (let index = 0; index < batches.length; index++) {
        signal.throwIfAborted();
        const batch = batches[index];
        setProgress(
          `Reading charts ${index + 1} / ${batches.length} · PDF pages ${batch.map((page) => page.page).join(", ")}`,
        );
        try {
          const pages = [];
          for (const page of batch) {
            const image = await renderPohPage(loaded, page, signal);
            setPreviews((current) => ({ ...current, [page.page]: image }));
            pages.push({
              page: page.page,
              text: page.text.slice(0, 8000),
              image,
            });
          }
          const result = (await api("POST", {
            documentId: document.id,
            sha256: loaded.sha256,
            registration: aircraft.registration,
            aircraftType: aircraft.type,
            context,
            pages,
          })) as PohExtractionResult;
          setIdentity(
            [result.registration, result.aircraftType]
              .filter(Boolean)
              .join(" · "),
          );
          const existing = new Set(
            aircraft.profiles
              .filter(
                (profile) =>
                  profile.documentId === document.id &&
                  profile.extraction?.documentSha256 === loaded.sha256,
              )
              .map(
                (profile) =>
                  `${profile.name}|${profile.extraction?.pages.join(",")}`,
              ),
          );
          for (const profile of result.profiles) {
            // Re-importing the same figures must not silently duplicate or replace reviewed data.
            if (
              existing.has(
                `${profile.name}|${profile.extraction?.pages.join(",")}`,
              )
            )
              messages.push(
                `Already imported: ${profile.name}. Existing profile kept.`,
              );
            else output.push({ ...profile, verified: false });
          }
          messages.push(...result.warnings);
        } catch (cause) {
          signal.throwIfAborted();
          messages.push(
            `Pages ${batch.map((page) => page.page).join(", ")}: ${cause instanceof Error ? cause.message : "Analysis failed."}`,
          );
        }
        setProfiles([...output]);
        setWarnings([...messages]);
      }
      if (!output.length) {
        setProgress(
          "No new profiles were created. Review the messages and source pages.",
        );
        return;
      }
      setProgress(`Saving ${output.length} performance profile drafts…`);
      signal.throwIfAborted();
      await onSave(output);
      if (!signal.aborted) {
        setSaved(true);
        setProgress(
          `${output.length} profiles created. Review their source readings before enabling them in Briefing.`,
        );
      }
    } catch (cause) {
      if (!signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "POH processing failed.",
        );
    } finally {
      if (!signal.aborted) {
        setWorking(false);
        onBusy(false);
      }
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FileSearch className="size-4" />
            Automatic POH profiles
          </h3>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {document.name}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close POH import"
        >
          <X />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Selected chart images and supporting text are sent to OpenAI for
        reading. The original PDF stays in your aircraft documents. Generated
        profiles include source references and remain drafts until you check and
        enable them.
      </p>
      <p role="status" className="flex items-center gap-2 text-sm">
        {working && <Loader2 className="size-4 animate-spin" />}
        {progress}
      </p>
      {loaded && (
        <>
          <AircraftField
            label="Performance chart PDF pages"
            disabled={working || saved || Boolean(profiles.length)}
            value={pageSelection}
            onChange={setPageSelection}
            placeholder="e.g. 109-112, 125-126"
          />
          <p className="text-xs text-muted-foreground">
            Use PDF page numbers, not printed POH page numbers. Include both
            ground-roll and obstacle-distance charts for each configuration. Up
            to 24 pages per import.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={working || saved || Boolean(profiles.length)}
              onClick={() => void createProfiles()}
            >
              <FileSearch />
              Create performance profiles
            </Button>
            {profiles.length > 0 && !saved && (
              <Button
                type="button"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  onBusy(true);
                  setError("");
                  try {
                    await onSave(profiles);
                    setSaved(true);
                    setProgress(`${profiles.length} profile drafts saved.`);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not save profiles.",
                    );
                  } finally {
                    setWorking(false);
                    onBusy(false);
                  }
                }}
              >
                Retry saving drafts
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {identity && (
        <p className="text-xs">Detected document aircraft: {identity}</p>
      )}
      {warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs">
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="space-y-2 rounded-md border border-border bg-background p-3"
        >
          <h4 className="font-semibold">
            {profile.name} · {profile.points.length} points ·{" "}
            {saved ? "Saved draft" : "Unsaved draft"}
          </h4>
          <p className="text-xs">{profile.configuration}</p>
          <p className="text-xs text-muted-foreground">{profile.source}</p>
          {profile.extraction?.warnings.map((warning, index) => (
            <p key={index} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
          <details>
            <summary className="cursor-pointer text-xs font-semibold">
              Extracted rows and source readings
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-xs">
                <thead>
                  <tr>
                    {[
                      "kg",
                      "PA ft",
                      "°C",
                      "HW kt",
                      "Slope %",
                      "Roll m",
                      "Total m",
                      "ASD m",
                    ].map((title) => (
                      <th key={title} className="p-2">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profile.points.map((point, index) => (
                    <tr
                      key={index}
                      title={profile.extraction?.rowEvidence[index]}
                    >
                      {[
                        point.weightKg,
                        point.pressureAltitudeFt,
                        point.temperatureC,
                        point.headwindKt,
                        point.slopePercent,
                        point.groundRollM,
                        point.distanceM,
                        point.accelerateStopM,
                      ].map((value, column) => (
                        <td key={column} className="p-2">
                          {value === null ? "—" : Number(value.toFixed(2))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              {profile.extraction?.rowEvidence.map((evidence, index) => (
                <li key={index}>{evidence}</li>
              ))}
            </ol>
          </details>
        </div>
      ))}
      {loaded && Object.keys(previews).length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Source chart previews
          </summary>
          <div className="mt-3 grid gap-3">
            {Object.entries(previews).map(([number, image]) => (
              <div key={number}>
                <p className="mb-1 text-xs">PDF page {number}</p>
                <img
                  src={image}
                  alt={`Source POH chart, PDF page ${number}`}
                  className="h-auto w-full rounded border border-border"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={working}
                  onClick={async () => {
                    const page = loaded.pages[Number(number) - 1];
                    page.rotation = (page.rotation + 90) % 360;
                    try {
                      const image = await renderPohPage(
                        loaded,
                        page,
                        controllerRef.current!.signal,
                      );
                      setPreviews((current) => ({
                        ...current,
                        [number]: image,
                      }));
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not rotate page.",
                      );
                    }
                  }}
                >
                  <RotateCw />
                  Rotate preview
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
