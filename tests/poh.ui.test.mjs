import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

// Uses the actual user-supplied PDF locally. The model and Firebase calls are
// mocked; this test does not transmit the document to an external service.
const pdfPath = process.argv[2];
if (!pdfPath)
  throw new Error(
    "Usage: node tests/poh.ui.test.mjs /path/to/HABEYPOH_2024completed.pdf",
  );
const pdf = await readFile(pdfPath);
const root = process.cwd();
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import PohImporter from './src/aircraft/PohImporter';
const document = {id:'test-pdf',name:'HABEYPOH_2024completed.pdf',size:${pdf.length},mimeType:'application/pdf',uploadedAt:'2026-09-28',storagePath:'test'};
const aircraft = {id:'test-plane',registration:'HA-BEY',type:'Piper PA-28-161',documents:[document],profiles:[],notes:'',updatedAt:'2026-09-28'};
createRoot(window.document.getElementById('root')).render(<main style={{maxWidth:1100,margin:'auto',padding:20}}><PohImporter uid="test-owner" aircraft={aircraft} document={document} onSave={async profiles => {window.savedProfiles = profiles;}} onBusy={()=>{}} onClose={()=>{}} /></main>);
`;
const bundled = await build({
  stdin: { contents: fixture, resolveDir: root, loader: "tsx" },
  bundle: true,
  write: false,
  format: "iife",
  tsconfig: path.join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "poh-test-services",
      setup(builder) {
        builder.onResolve({ filter: /pdf\.worker\.mjs\?url$/ }, () => ({
          path: "worker",
          namespace: "poh-test",
        }));
        builder.onResolve({ filter: /^@\/lib\/firebase\/client$/ }, () => ({
          path: "auth",
          namespace: "poh-test",
        }));
        builder.onResolve({ filter: /^\.\/repository$/ }, () => ({
          path: "repository",
          namespace: "poh-test",
        }));
        builder.onLoad(
          { filter: /.*/, namespace: "poh-test" },
          ({ path: name }) => ({
            loader: "js",
            contents:
              name === "worker"
                ? 'export default "https://poh.test/worker.mjs"'
                : name === "auth"
                  ? 'export function getFirebaseServices(){return {auth:{currentUser:{uid:"test-owner",getIdToken:async()=>"test-token"}}}}'
                  : 'export async function documentUrl(){return "https://poh.test/sample.pdf"}',
          }),
        );
      },
    },
  ],
});
const worker = await readFile(
  path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.mjs"),
);
let css = "";
try {
  const dir = "/tmp/vfrplanner-poh-build/assets";
  const files = await readdir(dir);
  css = await readFile(
    path.join(
      dir,
      files.find((file) => file.endsWith(".css")),
    ),
    "utf8",
  );
} catch {}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  const batches = [];
  let configured = true;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://poh.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/worker.mjs"))
      return route.fulfill({
        contentType: "application/javascript",
        body: worker,
      });
    if (url.endsWith("/test.js"))
      return route.fulfill({
        contentType: "application/javascript",
        body: bundled.outputFiles[0].text,
      });
    if (url.endsWith("/sample.pdf"))
      return route.fulfill({ contentType: "application/pdf", body: pdf });
    if (url.endsWith("/api/poh-import")) {
      assert.equal(
        route.request().headers().authorization,
        "Bearer test-token",
      );
      if (!configured)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Set OPENAI_API_KEY on the server." }),
        });
      if (route.request().method() === "GET")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ configured: true }),
        });
      const data = route.request().postDataJSON();
      assert.equal(data.sha256.length, 64);
      assert.equal(data.registration, "HA-BEY");
      assert(route.request().postData().length < 5000000);
      assert(
        data.pages.every((p) => p.image.startsWith("data:image/jpeg;base64,")),
      );
      const pages = data.pages.map((p) => p.page);
      batches.push(pages);
      const phase = pages[0] === 125 ? "landing" : "takeoff";
      const profile = {
        id: `test-${pages[0]}`,
        name: `Synthetic ${phase} ${pages[0]} — not for flight`,
        phase,
        source: `Synthetic fixture; PDF ${pages.join(",")}`,
        documentId: "test-pdf",
        configuration: "Synthetic test data, not actual chart readings",
        surface: "paved",
        condition: "dry",
        obstacleHeightFt: 50,
        interpolation: "exact",
        verified: true,
        points: [
          {
            weightKg: 1000,
            pressureAltitudeFt: 0,
            temperatureC: 20,
            headwindKt: 0,
            slopePercent: 0,
            groundRollM: 100,
            distanceM: 200,
            accelerateStopM: null,
          },
        ],
        extraction: {
          documentSha256: data.sha256,
          model: "mock",
          createdAt: "2026-09-28",
          pages,
          method: "chart",
          warnings: ["Synthetic test only"],
          rowEvidence: [
            "Test fixture; does not represent the supplied aircraft.",
          ],
        },
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          aircraftType: "Piper PA-28-161",
          registration: "HA-BEY",
          profiles: [profile],
          warnings: [],
        }),
      });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script src="/test.js"></script></body></html>`,
    });
  });
  await page.goto("https://poh.test/");
  await page
    .getByText("424 pages scanned · 6 candidate performance pages", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Performance chart PDF pages").inputValue(),
    "109, 110, 111, 112, 125, 126",
  );
  await page
    .getByRole("button", { name: "Create performance profiles", exact: true })
    .click();
  await page
    .getByText(
      "3 profiles created. Review their source readings before enabling them in Briefing.",
      { exact: true },
    )
    .waitFor();
  assert.deepEqual(batches, [
    [109, 110],
    [111, 112],
    [125, 126],
  ]);
  assert(
    await page.evaluate(
      () =>
        window.savedProfiles.length === 3 &&
        window.savedProfiles.every((p) => p.verified === false),
    ),
  );
  await page.getByText("Source chart previews", { exact: true }).click();
  assert.equal(await page.locator('img[alt^="Source POH chart"]').count(), 6);
  await page.screenshot({ path: "/tmp/poh-import-review.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Importer must fit mobile width",
  );
  configured = false;
  await page.reload();
  await page
    .getByText("424 pages scanned · 6 candidate performance pages", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Create performance profiles", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Set OPENAI_API_KEY" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.savedProfiles?.length ?? 0), 0);
  assert.deepEqual(errors, []);
  console.log(
    "POH browser test passed: actual 424-page PDF, chart detection/rotation/rendering, 3 image batches, draft-only save, previews, missing API key, mobile layout. AI response mocked.",
  );
} finally {
  await browser.close();
}
