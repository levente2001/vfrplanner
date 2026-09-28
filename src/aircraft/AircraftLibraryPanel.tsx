import { lazy, Suspense, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileSearch,
  FileText,
  Plane,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { AircraftField } from "./fields";
import { ProfileEditor } from "./ProfileEditor";
import {
  aircraftError,
  documentUrl,
  removeAircraft,
  removeAircraftDocument,
  saveAircraft,
  uploadAircraftDocument,
} from "./repository";
import { aircraftQueryKey, useAircraft } from "./useAircraft";
import type { Aircraft, AircraftDocument, PerformanceProfile } from "./types";

const PohImporter = lazy(() => import("./PohImporter"));

export function AircraftLibraryPanel({ user }: { user: User | null }) {
  if (!user)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="panel-heading">My aircraft</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          Sign in to save aircraft, POHs and performance profiles to your
          account.
        </CardContent>
      </Card>
    );
  return <AircraftLibrary key={user.uid} uid={user.uid} />;
}

function AircraftLibrary({ uid }: { uid: string }) {
  const query = useAircraft(uid);
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Aircraft | null>(null);
  const [editingProfile, setEditingProfile] = useState<
    PerformanceProfile | "new" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [importTarget, setImportTarget] = useState<{
    document: AircraftDocument;
    file?: File;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const aircraft = query.data?.find((item) => item.id === selectedId);
  function remember(value: Aircraft) {
    cache.setQueryData<Aircraft[]>(aircraftQueryKey(uid), (items = []) =>
      [...items.filter((item) => item.id !== value.id), value].sort((a, b) =>
        a.registration.localeCompare(b.registration),
      ),
    );
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(aircraftError(cause));
    } finally {
      setBusy(false);
    }
  }
  function create() {
    setImportTarget(null);
    setEditingProfile(null);
    setDraft({
      id: crypto.randomUUID(),
      registration: "",
      type: "",
      notes: "",
      documents: [],
      profiles: [],
      updatedAt: new Date().toISOString(),
    });
  }
  async function saveProfile(profile: PerformanceProfile) {
    if (!aircraft) return;
    setBusy(true);
    try {
      const updated = {
        ...aircraft,
        profiles: [
          ...aircraft.profiles.filter((item) => item.id !== profile.id),
          profile,
        ],
      };
      await saveAircraft(uid, updated);
      remember(updated);
      setEditingProfile(null);
      setNotice("Performance profile saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="my-aircraft" className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border bg-panel-muted">
          <div>
            <CardTitle className="panel-heading flex items-center gap-2">
              <Plane className="size-4" />
              My aircraft
            </CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">
              Aircraft documents and POH performance profiles, saved to your
              account.
            </p>
          </div>
          <Button
            disabled={busy || query.isPending || query.isError}
            onClick={create}
          >
            <Plus />
            Add aircraft
          </Button>
        </CardHeader>
      </Card>
      {(error || query.error) && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error || aircraftError(query.error)}
          {query.isError && (
            <Button
              variant="outline"
              className="ml-3"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {query.isPending && <p>Loading aircraft…</p>}
      {draft && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const registration = draft.registration.trim().toUpperCase();
                  if (!registration || !draft.type.trim())
                    throw new Error("Enter registration and aircraft type.");
                  if (
                    query.data?.some(
                      (item) =>
                        item.id !== draft.id &&
                        item.registration.toUpperCase() === registration,
                    )
                  )
                    throw new Error("This registration already exists.");
                  const updated = {
                    ...draft,
                    registration,
                    type: draft.type.trim(),
                  };
                  await saveAircraft(uid, updated);
                  remember(updated);
                  setSelectedId(updated.id);
                  setDraft(null);
                  setNotice("Aircraft saved.");
                });
              }}
            >
              <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
                <AircraftField
                  label="Registration"
                  value={draft.registration}
                  onChange={(v) => setDraft({ ...draft, registration: v })}
                  placeholder="HA-…"
                  required
                />
                <AircraftField
                  label="Aircraft type / variant"
                  value={draft.type}
                  onChange={(v) => setDraft({ ...draft, type: v })}
                  placeholder="Exact model and variant"
                  required
                />
                <AircraftField
                  label="Notes / serial number"
                  value={draft.notes}
                  onChange={(v) => setDraft({ ...draft, notes: v })}
                />
              </fieldset>
              <div className="flex gap-2">
                <Button disabled={busy} type="submit">
                  Save aircraft
                </Button>
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-2 p-3">
            {query.data?.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                No aircraft yet. Add one to upload its POH.
              </p>
            )}
            {query.data?.map((item) => (
              <button
                key={item.id}
                disabled={busy || Boolean(draft)}
                onClick={() => {
                  setSelectedId(item.id);
                  setImportTarget(null);
                  setEditingProfile(null);
                  setError("");
                  setNotice("");
                }}
                className={`w-full rounded-md border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary/10" : "border-border"}`}
              >
                <span className="block font-mono font-semibold">
                  {item.registration}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {item.type}
                </span>
                <span className="mt-2 block text-xs">
                  {item.documents.length} documents · {item.profiles.length}{" "}
                  profiles
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
        {aircraft && !draft ? (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border">
              <div>
                <CardTitle>
                  {aircraft.registration} · {aircraft.type}
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  {aircraft.notes}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => {
                    setDraft(aircraft);
                    setEditingProfile(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete ${aircraft.registration} and all its documents and profiles?`,
                      )
                    )
                      return;
                    void run(async () => {
                      await removeAircraft(uid, aircraft);
                      cache.setQueryData<Aircraft[]>(
                        aircraftQueryKey(uid),
                        (items = []) =>
                          items.filter((item) => item.id !== aircraft.id),
                      );
                      setSelectedId("");
                    });
                  }}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-4">
              <div className="space-y-3">
                <h3 className="font-semibold">POH & documents</h3>
                <p className="text-xs text-muted-foreground">
                  PDF, JPG, PNG, TXT or CSV · up to 150 MB per file. Uploads are
                  stored privately under your signed-in account.
                </p>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload />
                  Upload document
                </Button>
                <input
                  ref={uploadInputRef}
                  disabled={busy}
                  className="hidden"
                  aria-label="Upload document"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.txt,.csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file)
                      void run(async () => {
                        const updated = await uploadAircraftDocument(
                          uid,
                          aircraft,
                          file,
                        );
                        remember(updated);
                        setNotice("Document uploaded.");
                        const uploaded =
                          updated.documents[updated.documents.length - 1];
                        if (uploaded.mimeType === "application/pdf") {
                          setEditingProfile(null);
                          setImportTarget({ document: uploaded, file });
                        }
                      });
                  }}
                />
                {aircraft.documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
                  >
                    <FileText className="size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm">{document.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(document.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {new Date(document.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const url = await documentUrl(uid, document);
                          const link = window.document.createElement("a");
                          link.href = url;
                          link.download = document.name;
                          link.rel = "noopener noreferrer";
                          link.target = "_blank";
                          window.document.body.append(link);
                          link.click();
                          link.remove();
                        })
                      }
                    >
                      <Download />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        busy ||
                        Boolean(editingProfile) ||
                        importTarget?.document.id === document.id
                      }
                      aria-label={`Delete ${document.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${document.name}?`))
                          void run(async () =>
                            remember(
                              await removeAircraftDocument(
                                uid,
                                aircraft,
                                document,
                              ),
                            ),
                          );
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {aircraft.documents
                  .filter((document) => document.mimeType === "application/pdf")
                  .map((document) => (
                    <Button
                      key={document.id}
                      type="button"
                      variant="outline"
                      className="h-auto max-w-full whitespace-normal break-words text-left"
                      disabled={
                        busy ||
                        Boolean(editingProfile) ||
                        importTarget?.document.id === document.id
                      }
                      onClick={() => setImportTarget({ document })}
                    >
                      <FileSearch />
                      Create profiles from {document.name}
                    </Button>
                  ))}
              </div>
              {importTarget && (
                <Suspense
                  fallback={<p className="text-sm">Loading POH reader…</p>}
                >
                  <PohImporter
                    key={importTarget.document.id}
                    uid={uid}
                    aircraft={aircraft}
                    document={importTarget.document}
                    file={importTarget.file}
                    onBusy={setBusy}
                    onClose={() => setImportTarget(null)}
                    onSave={async (profiles) => {
                      const updated = {
                        ...aircraft,
                        profiles: [
                          ...aircraft.profiles,
                          ...profiles
                            .filter(
                              (profile) =>
                                !aircraft.profiles.some(
                                  (existing) => existing.id === profile.id,
                                ),
                            )
                            .map((profile) => ({
                              ...profile,
                              verified: false,
                            })),
                        ],
                      };
                      await saveAircraft(uid, updated);
                      remember(updated);
                      setNotice(
                        `${profiles.length} POH profile drafts created. Use Edit profile to review and enable them.`,
                      );
                    }}
                  />
                </Suspense>
              )}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">POH performance profiles</h3>
                  <Button
                    variant="outline"
                    disabled={
                      busy ||
                      !aircraft.documents.length ||
                      Boolean(editingProfile)
                    }
                    onClick={() => setEditingProfile("new")}
                  >
                    <Plus />
                    Add profile
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a POH PDF and use Create profiles to read its charts
                  automatically, or enter data manually. Check generated
                  readings against the source before enabling a profile.
                </p>
                {aircraft.profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-medium">{profile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile.phase} · {profile.points.length} rows ·{" "}
                        {profile.verified ? "Verified" : "Draft"} ·{" "}
                        {profile.source}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || Boolean(editingProfile)}
                        onClick={() => setEditingProfile(profile)}
                      >
                        Edit profile
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || Boolean(editingProfile)}
                        aria-label={`Delete profile ${profile.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete profile ${profile.name}?`))
                            void run(async () => {
                              const updated = {
                                ...aircraft,
                                profiles: aircraft.profiles.filter(
                                  (item) => item.id !== profile.id,
                                ),
                              };
                              await saveAircraft(uid, updated);
                              remember(updated);
                            });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {editingProfile && (
                <ProfileEditor
                  key={
                    typeof editingProfile === "string"
                      ? "new"
                      : editingProfile.id
                  }
                  aircraft={aircraft}
                  initial={
                    typeof editingProfile === "string"
                      ? undefined
                      : editingProfile
                  }
                  busy={busy}
                  onSave={saveProfile}
                  onCancel={() => setEditingProfile(null)}
                />
              )}
            </CardContent>
          </Card>
        ) : (
          !draft && (
            <p className="p-4 text-sm text-muted-foreground">
              Select an aircraft to manage documents and performance.
            </p>
          )
        )}
      </div>
    </section>
  );
}
