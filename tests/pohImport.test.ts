import assert from "node:assert/strict";
import {
  chartGroup,
  dominantTextRotation,
  groupPohPages,
  parsePageSelection,
} from "../src/aircraft/pohAnalysis";
import { normalizePohExtraction } from "../src/aircraft/pohExtraction";
import {
  handlePohImport,
  parsePohImportRequest,
} from "../src/lib/pohImportServer";
import { firebaseConfig } from "../src/lib/firebase/config";

assert.equal(
  chartGroup(
    "PA-28-161 0° FLAPS TAKEOFF PERFORMANCE ASSOCIATED CONDITIONS WEIGHT WIND OUTSIDE AIR TEMP",
  ),
  "takeoff-0",
);
assert.equal(
  chartGroup(
    "PA-28-161 25 ° FLAPS TAKEOFF GROUND ROLL ASSOCIATED CONDITIONS WEIGHT WIND OUTSIDE AIR TEMP",
  ),
  "takeoff-25",
);
assert.equal(
  chartGroup("LANDING DISTANCE ASSOCIATED CONDITIONS WEIGHT WIND TEMPERATURE"),
  "landing",
);
assert.equal(
  chartGroup(
    "LIST OF FIGURES 0° FLAPS TAKEOFF PERFORMANCE ASSOCIATED CONDITIONS WEIGHT WIND TEMPERATURE",
  ),
  null,
);
assert.equal(chartGroup("Cruise performance weight wind temperature"), null);
assert.deepEqual(
  parsePageSelection("109-112,125,126,109", 424),
  [109, 110, 111, 112, 125, 126],
);
assert.throws(() => parsePageSelection("1-425", 424));
assert.throws(() => parsePageSelection("1-25", 424));
assert.throws(() => parsePageSelection("0", 424));
assert.throws(() => parsePageSelection("", 424));
assert.deepEqual(
  groupPohPages([
    { page: 1, text: "", rotation: 0, group: "takeoff-0" },
    { page: 2, text: "", rotation: 0, group: "landing" },
    { page: 3, text: "", rotation: 0, group: "takeoff-0" },
  ]).map((batch) => batch.map((page) => page.page)),
  [[1, 3], [2]],
);
assert.equal(
  dominantTextRotation([
    { str: "chart chart chart", transform: [0, 1, -1, 0, 0, 0] },
    { str: "header", transform: [1, 0, 0, 1, 0, 0] },
  ]),
  90,
);

// Synthetic fixture; no operational aircraft performance values are bundled.
const raw = {
  aircraftType: "Synthetic test model",
  registration: "HA-TEST",
  warnings: ["Test only"],
  profiles: [
    {
      name: "Test takeoff",
      phase: "takeoff",
      source: "Synthetic figure",
      pages: [109, 110],
      configuration: "Test only",
      surface: "paved",
      condition: "dry",
      obstacleHeightFt: 50,
      method: "chart",
      interpolation: "linear",
      weightUnit: "lb",
      altitudeUnit: "ft",
      distanceUnit: "ft",
      temperatureUnit: "F",
      warnings: [],
      points: [
        {
          weight: 2000,
          pressureAltitude: 1000,
          temperature: 68,
          headwindKt: 0,
          slopePercent: 0,
          groundRoll: 1000,
          distance: 2000,
          accelerateStop: null,
          evidence:
            "Synthetic figure at 2000 lb: ground roll 1000 ft; total 2000 ft.",
        },
        {
          weight: 2200,
          pressureAltitude: 1000,
          temperature: 68,
          headwindKt: 0,
          slopePercent: 0,
          groundRoll: 1200,
          distance: 2400,
          accelerateStop: null,
          evidence:
            "Synthetic figure at 2200 lb: ground roll 1200 ft; total 2400 ft.",
        },
      ],
    },
  ],
};
const context = {
  documentId: "test-document",
  sha256: "a".repeat(64),
  model: "test-model",
  pages: [109, 110],
  now: "2026-09-28T12:00:00Z",
};
const result = normalizePohExtraction(raw, context);
assert.equal(result.profiles.length, 1);
assert.equal(result.profiles[0].verified, false);
assert.equal(result.profiles[0].points[0].groundRollM, 304.8);
assert.equal(result.profiles[0].points[0].weightKg, 907.18474);
assert.equal(result.profiles[0].points[0].temperatureC, 20);
assert.equal(result.profiles[0].points[0].accelerateStopM, null);
assert.deepEqual(result.profiles[0].extraction?.pages, [109, 110]);
assert(result.profiles[0].extraction?.warnings.includes("Test only"));
const mutate = (change: (value: typeof raw) => void) => {
  const next = structuredClone(raw);
  change(next);
  return normalizePohExtraction(next, context);
};
assert.equal(
  mutate((value) => {
    value.profiles[0].pages = [300];
  }).profiles.length,
  0,
);
assert.equal(
  mutate((value) => {
    value.profiles[0].points[0].evidence = "";
  }).profiles.length,
  0,
);
assert.equal(
  mutate((value) => {
    value.profiles[0].points[0].distance = 1;
  }).profiles.length,
  0,
);
assert.equal(
  mutate((value) => {
    value.profiles[0].points[0].weight = NaN;
  }).profiles.length,
  0,
);
assert.equal(
  mutate((value) => {
    value.profiles[0].points[0].temperature = 50;
  }).profiles.length,
  0,
); // incomplete 2x2 grid
assert.equal(
  mutate((value) => {
    value.profiles[0].method = "example";
  }).profiles[0].interpolation,
  "exact",
);

const requestBody = {
  documentId: context.documentId,
  sha256: context.sha256,
  registration: "HA-TEST",
  aircraftType: "Synthetic test model",
  context: "Untrusted document text",
  pages: [
    { page: 109, text: "chart", image: "data:image/jpeg;base64,/9j/AAAA" },
    { page: 110, text: "chart", image: "data:image/jpeg;base64,/9j/AAAA" },
  ],
};
assert.equal(parsePohImportRequest(requestBody).pages.length, 2);
assert.throws(() =>
  parsePohImportRequest({
    ...requestBody,
    pages: [
      { ...requestBody.pages[0], image: "https://private.example/chart" },
    ],
  }),
);
assert.throws(() =>
  parsePohImportRequest({
    ...requestBody,
    pages: [requestBody.pages[0], requestBody.pages[0]],
  }),
);
const uid = "poh-test-user";
const token = `test.${btoa(JSON.stringify({ sub: uid, aud: firebaseConfig.projectId, iss: `https://securetoken.google.com/${firebaseConfig.projectId}`, exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=/g, "")}.signature`;
let providerCalls = 0;
const fetcher: typeof fetch = async (input, init) => {
  if (String(input).startsWith("https://identitytoolkit.googleapis.com/"))
    return new Response(JSON.stringify({ users: [{ localId: uid }] }));
  assert.equal(String(input), "https://api.openai.com/v1/responses");
  providerCalls++;
  const sent = JSON.parse(String(init?.body));
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.strict, true);
  assert.equal(
    sent.input[0].content.filter(
      (item: { type: string }) => item.type === "input_image",
    ).length,
    2,
  );
  assert(sent.instructions.includes("untrusted source DATA"));
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(raw) }] },
      ],
    }),
  );
};
const makeRequest = (auth = true) =>
  new Request("https://example.test/api/poh-import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(requestBody),
  });
assert.equal(
  (await handlePohImport(makeRequest(false), { apiKey: "test", fetcher }))
    .status,
  401,
);
assert.equal((await handlePohImport(makeRequest(), { fetcher })).status, 503);
assert.equal(providerCalls, 0);
assert.equal(
  (
    await handlePohImport(makeRequest(), {
      apiKey: "test",
      fetcher,
      allowedUids: "another-user",
    })
  ).status,
  403,
);
const response = await handlePohImport(makeRequest(), {
  apiKey: "test",
  fetcher,
});
assert.equal(response.status, 200);
const data = await response.json();
assert.equal(data.profiles[0].verified, false);
assert.equal(providerCalls, 1);
console.log(
  "POH import tests passed: chart detection, units, provenance, grid rejection, auth and provider request.",
);
