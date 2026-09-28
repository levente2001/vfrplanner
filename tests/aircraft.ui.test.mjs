import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

// Browser workflow test with an in-memory repository. Cloud permissions/uploads
// must be tested separately against a staging Firebase project.
const root = process.cwd();
const repository = `
let items = [];
export async function listAircraft() { return items; }
export async function saveAircraft(uid, aircraft) { items = [...items.filter(a => a.id !== aircraft.id), aircraft]; }
export async function uploadAircraftDocument(uid, aircraft, file) {
  const updated = {...aircraft, documents:[...aircraft.documents, {id:'document', name:file.name, size:file.size, mimeType:file.type, uploadedAt:new Date().toISOString(), storagePath:'test'}]};
  await saveAircraft(uid, updated); return updated;
}
export async function removeAircraftDocument(uid, aircraft, document) { const updated = {...aircraft, documents:aircraft.documents.filter(d => d.id !== document.id)}; await saveAircraft(uid,updated); return updated; }
export async function removeAircraft(uid, aircraft) { items = items.filter(a => a.id !== aircraft.id); }
export async function documentUrl() { return 'data:text/plain,test'; }
export function aircraftError(error) { return error?.message ?? 'Error'; }
`;
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AircraftLibraryPanel} from './src/aircraft/AircraftLibraryPanel';
import {PerformancePanel} from './src/aircraft/PerformancePanel';
const user = {uid:'test-owner'};
const airport = {icao:'TEST', elevationFt:0, suggestedRunway:'09', runways:[{id:'09',heading:90,lengthFt:3000,surface:'ASPH'},{id:'27',heading:270,lengthFt:3000,surface:'ASPH'}], weather:{requestedIcao:'TEST',station:'TEST',temperatureC:10,qnhHpa:1013.25,observedAt:'2026-09-28T12:00:00Z',rawMetar:'SYNTHETIC TEST DATA'},wind:{direction:90,speedKt:0,source:'METAR'}};
const queryClient = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><main style={{maxWidth:1300,margin:'auto',padding:24}}><AircraftLibraryPanel user={user}/><div style={{marginTop:24}}><PerformancePanel user={user} departure={airport} arrival={airport}/></div></main></QueryClientProvider>);
`;
const bundled = await build({
  stdin: { contents: fixture, resolveDir: root, loader: "tsx" },
  bundle: true,
  write: false,
  format: "iife",
  define: { "process.env.NODE_ENV": '"development"' },
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [
    {
      name: "mock-aircraft-repository",
      setup(builder) {
        builder.onResolve({ filter: /pdf\.worker\.mjs\?url$/ }, () => ({
          path: "pdf-worker",
          namespace: "test-worker",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test-worker" }, () => ({
          contents: 'export default "/pdf.worker.mjs"',
          loader: "js",
        }));
        builder.onResolve({ filter: /^\.\/repository$/ }, (args) =>
          args.importer.includes("/src/aircraft/")
            ? { path: "repository", namespace: "aircraft-test" }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "aircraft-test" }, () => ({
          contents: repository,
          loader: "js",
        }));
      },
    },
  ],
});
let css = "";
try {
  const dir = "/tmp/vfrplanner-aircraft-build/assets";
  const files = await readdir(dir);
  css = await readFile(
    path.join(
      dir,
      files.find((file) => file.endsWith(".css")),
    ),
    "utf8",
  );
} catch {
  /* Styles are optional for workflow assertions. */
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://aircraft.test/**", async (route) => {
    if (route.request().url().endsWith("/test.js"))
      await route.fulfill({
        contentType: "application/javascript",
        body: bundled.outputFiles[0].text,
      });
    else
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script src="/test.js"></script></body></html>`,
      });
  });
  await page.goto("https://aircraft.test/");
  await page.getByRole("button", { name: "Add aircraft", exact: true }).click();
  await page.getByLabel("Registration", { exact: true }).fill("HA-TEST");
  await page
    .getByLabel("Aircraft type / variant")
    .fill("Synthetic test aircraft");
  await page
    .getByRole("button", { name: "Save aircraft", exact: true })
    .click();
  await page.getByLabel("Upload document").setInputFiles({
    name: "test-poh.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic test data. Not for flight."),
  });
  await page.getByText("Document uploaded.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add profile", exact: true }).click();
  await page.getByLabel("Profile name", { exact: true }).fill("Test takeoff");
  await page
    .getByLabel("POH revision / page / table")
    .fill("Synthetic fixture page 1");
  await page
    .getByLabel("Configuration / technique / limitations")
    .fill("Synthetic test only, flaps 0");
  await page
    .getByLabel("POH data (CSV)")
    .fill(
      "weightKg,pressureAltitudeFt,temperatureC,headwindKt,slopePercent,groundRollM,distanceM,accelerateStopM\n1000,0,10,0,0,200,400,",
    );
  await page.getByRole("checkbox", { name: /I checked the data/ }).check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Performance profile saved.", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/aircraft-library.png", fullPage: true });
  await page
    .getByLabel("Aircraft / POH", { exact: true })
    .selectOption({ label: "HA-TEST · Synthetic test aircraft" });
  await page
    .getByLabel("Verified POH profile", { exact: true })
    .first()
    .selectOption({ label: "Test takeoff" });
  await page.getByLabel("Takeoff mass (kg)").fill("1000");
  await page.getByLabel("Slope uphill + / downhill − (%)").fill("0");
  await page
    .getByLabel("Actual surface", { exact: true })
    .selectOption("paved");
  await page
    .getByLabel("Actual runway condition", { exact: true })
    .selectOption("dry");
  await page.getByRole("checkbox", { name: /I checked these inputs/ }).check();
  await page.getByRole("cell", { name: "400 m", exact: true }).waitFor();
  await page
    .getByRole("cell", { name: "Not supplied by POH", exact: true })
    .waitFor();
  await page.getByLabel("TORA (m)", { exact: true }).fill("800");
  await page.getByLabel("TODA (m)", { exact: true }).fill("900");
  await page.getByLabel("ASDA (m)", { exact: true }).fill("850");
  await page
    .getByLabel("AIP / NOTAM reference and effective date")
    .fill("Synthetic fixture only");
  // Any edited inputs require a new condition confirmation.
  await page.getByRole("checkbox", { name: /I checked these inputs/ }).check();
  await page
    .getByRole("checkbox", { name: /I verified these declared distances/ })
    .check();
  await page.getByText("500 m · distance fits", { exact: true }).waitFor();
  await page.getByLabel("Additional planning factor").fill("3");
  await page.getByRole("checkbox", { name: /I checked these inputs/ }).check();
  await page
    .getByText("-300 m · insufficient distance", { exact: true })
    .waitFor();
  await page.getByLabel("Takeoff mass (kg)").fill("2000");
  await page.getByRole("checkbox", { name: /I checked these inputs/ }).check();
  await page
    .getByText(/No exact POH row matches|outside the verified POH range/)
    .waitFor();
  assert.equal(
    await page
      .getByText("-300 m · insufficient distance", { exact: true })
      .count(),
    0,
  );
  await page.getByLabel("Takeoff mass (kg)").fill("1000");
  await page.getByLabel("Additional planning factor").fill("1");
  await page.getByRole("checkbox", { name: /I checked these inputs/ }).check();
  await page.screenshot({
    path: "/tmp/aircraft-performance.png",
    fullPage: true,
  });
  await page
    .getByLabel("Runway direction", { exact: true })
    .first()
    .selectOption("27");
  assert.equal(
    await page.getByLabel("TORA (m)", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: /I checked these inputs/ })
      .isChecked(),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile page must not overflow horizontally",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Aircraft browser workflow passed (mock repository): create, attach file, verified profile, calculation, margin, missing ASDA, invalidation, runway change, mobile width.",
  );
} finally {
  await browser.close();
}
