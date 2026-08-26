import { useMemo, useState } from "react";
import { AlertTriangle, Clipboard, ExternalLink, FileWarning, RefreshCw } from "lucide-react";
import {
  buildNotamRequest,
  fetchRouteNotams,
  parseNotamBriefing,
  type NotamItem,
} from "@/lib/notams";
import type { WaypointMeta } from "@/lib/vfr/nav";
import { Alert, AlertDescription } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";

type Props = {
  waypoints: WaypointMeta[];
};

function formatValidity(notam: NotamItem) {
  if (notam.effectiveStart && notam.effectiveEnd) {
    return `${notam.effectiveStart} - ${notam.effectiveEnd}`;
  }
  return notam.effectiveStart || notam.effectiveEnd || "Validity not provided";
}

export function NotamPanel({ waypoints }: Props) {
  const [corridorNm, setCorridorNm] = useState("10");
  const [notams, setNotams] = useState<NotamItem[]>([]);
  const [briefingText, setBriefingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy route");

  const routeLabel = useMemo(
    () => waypoints.map((waypoint) => waypoint.label).join(" -> "),
    [waypoints],
  );

  const coordinateRoute = useMemo(
    () =>
      waypoints
        .map((waypoint) => `${waypoint.label} ${waypoint.lat.toFixed(4)},${waypoint.lon.toFixed(4)}`)
        .join("\n"),
    [waypoints],
  );

  async function copyRoute() {
    const routeText = coordinateRoute || routeLabel;
    if (!routeText) return;

    await navigator.clipboard.writeText(routeText);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy route"), 1500);
  }

  function parseBriefing() {
    const parsed = parseNotamBriefing(briefingText);
    setNotams(parsed);
    setError(parsed.length ? "" : "Paste a NOTAM briefing text before formatting.");
  }

  async function loadNotams() {
    if (waypoints.length < 2) {
      setError("Calculate a route or add at least two map waypoints before requesting NOTAMs.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const request = buildNotamRequest(waypoints, parseFloat(corridorNm) || 10);
      setNotams(await fetchRouteNotams(request));
    } catch (e) {
      setNotams([]);
      setError(e instanceof Error ? e.message : "NOTAM request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="notams" className="relative">
      <Card className="overflow-hidden">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border bg-panel-muted px-4 py-3">
          <div className="min-w-0">
            <CardTitle className="panel-heading flex items-center gap-2">
              <FileWarning className="size-4" />
              Route NOTAMs
            </CardTitle>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {routeLabel || "No route selected"}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            Briefing helper
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[160px_minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="notamCorridor">
                Corridor (NM)
              </Label>
              <Input
                id="notamCorridor"
                type="number"
                min="1"
                max="100"
                step="1"
                value={corridorNm}
                onChange={(event) => setCorridorNm(event.target.value)}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Open a free NOTAM briefing site, copy this route if needed, then paste the returned
              briefing below to format it in the planner. Direct automatic import from free sites is
              usually blocked by CORS or site terms.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Button variant="outline" onClick={copyRoute} disabled={waypoints.length < 2}>
                <Clipboard className="size-4" />
                {copyLabel}
              </Button>
              <Button asChild>
                <a href="https://www.notaminfo.com/" target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open NOTAM site
                </a>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button asChild variant="outline">
              <a href="https://www.notaminfo.com/" target="_blank" rel="noreferrer">
                NOTAM Info
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="https://www.ead.eurocontrol.int/" target="_blank" rel="noreferrer">
                EAD Basic
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="https://notams.aim.faa.gov/notamSearch/" target="_blank" rel="noreferrer">
                FAA NOTAM Search
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={loadNotams}
              disabled={loading || waypoints.length < 2}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Configured API
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="field-label" htmlFor="notamBriefing">
              Paste NOTAM briefing
            </Label>
            <Textarea
              id="notamBriefing"
              value={briefingText}
              onChange={(event) => setBriefingText(event.target.value)}
              className="min-h-[150px] resize-y font-mono text-xs"
              placeholder={"A1234/26 NOTAMN\nQ) LHCC/...\nA) LHBP\nB) 2608060800 C) 2608061600\nE) ..."}
            />
            <div className="flex justify-end">
              <Button variant="outline" onClick={parseBriefing}>
                Format pasted NOTAMs
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!error && notams.length === 0 && (
            <div className="rounded-md border border-dashed border-border bg-panel-muted p-4 text-sm text-muted-foreground">
              No NOTAMs loaded yet. Use an external briefing source, then paste the NOTAM text
              here for readable formatting.
            </div>
          )}

          {notams.length > 0 && (
            <div className="space-y-3">
              {notams.map((notam) => (
                <article
                  key={notam.id}
                  className="rounded-md border border-border bg-background p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{notam.id}</Badge>
                    {notam.location && <Badge variant="secondary">{notam.location}</Badge>}
                    {notam.qCode && <Badge variant="outline">{notam.qCode}</Badge>}
                    {(notam.lowerLimit || notam.upperLimit) && (
                      <Badge variant="outline">
                        {notam.lowerLimit || "SFC"} / {notam.upperLimit || "UNL"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    {formatValidity(notam)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{notam.text}</p>
                  {notam.raw && notam.raw !== notam.text && (
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-mono uppercase tracking-[0.12em]">
                        Raw NOTAM
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded-md bg-panel-muted p-3 font-mono text-[11px] leading-relaxed">
                        {notam.raw}
                      </pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <div
        className="absolute inset-0 z-10 grid cursor-not-allowed place-items-center rounded-xl border border-yellow-500/25 bg-background/55 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-yellow-700/90 backdrop-blur-[1px]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0, rgba(234, 179, 8, 0.2) 8px, transparent 8px, transparent 22px)",
        }}
      >
        <span className="rounded-xl border border-yellow-500/25 bg-background/70 px-4 py-2">
          under development
        </span>
      </div>
    </section>
  );
}
