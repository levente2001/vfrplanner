# Aircraft library setup

The **My aircraft** view stores metadata and verified performance tables at
`users/{uid}/aircraft/{aircraftId}` in Firestore. Documents are stored at
`users/{uid}/aircraft/{aircraftId}/{documentId}.{extension}` in Firebase Storage.
It uses the existing Firebase project configuration and sign-in flow. There is
no local-only fallback and failed writes are shown as errors.

Enable Firebase Storage for the configured bucket before using document uploads.
Merge the following matches into the project's **existing** rules; do not replace
unrelated application rules. No rules are deployed by the application.

Firestore, inside `match /databases/{database}/documents`:

```text
match /users/{uid}/aircraft/{aircraftId} {
  allow read, delete: if request.auth != null && request.auth.uid == uid;
  allow create, update: if request.auth != null && request.auth.uid == uid
    && request.resource.data.id == aircraftId
    && request.resource.data.registration is string
    && request.resource.data.registration.size() > 0
    && request.resource.data.registration.size() <= 40
    && request.resource.data.type is string
    && request.resource.data.type.size() > 0
    && request.resource.data.type.size() <= 200
    && request.resource.data.documents is list
    && request.resource.data.profiles is list;
}
```

Storage, inside `match /b/{bucket}/o`:

```text
match /users/{uid}/aircraft/{aircraftId}/{fileName} {
  allow read, delete: if request.auth != null && request.auth.uid == uid;
  allow create: if request.auth != null && request.auth.uid == uid
    && request.resource.size > 0
    && request.resource.size <= 150 * 1024 * 1024
    && request.resource.contentType.matches(
      'application/pdf|image/png|image/jpeg|text/plain|text/csv'
    );
}
```

Review any broader existing allow rules: Firebase allow rules are additive.
Test owner upload/read/delete and a different account's denial using the Firebase
emulators or a staging project before deployment. Download URLs contain Firebase
access tokens; anyone given a download URL can download that document.

## POH data and calculations

Upload a PDF to open the POH reader, then choose **Create performance profiles**.
Existing PDFs have a **Create profiles from …** button. The reader finds candidate
charts in the text layer, rotates sideways charts, and groups matching takeoff and
landing pages. The HA-BEY example was checked locally: 424 pages, chart pairs
109–110 (0° takeoff), 111–112 (25° takeoff), 125–126 (landing). No aircraft-specific
performance values or copies of the user's PDF are bundled into the app.

For fully scanned PDFs with no usable text layer, enter the PDF chart page numbers.
These pages are still processed as images. Include both ground-roll and total
distance figures for each configuration. At most 24 selected pages are processed
in batches of up to four images. The full PDF may be up to 150 MB; it is parsed in
the browser and is not posted to the serverless API in one large request.

The image model creates separate profiles with configuration, source pages,
native units and per-row reading evidence. Unit conversions and data validation
are deterministic. Invalid distances, duplicate conditions, missing evidence,
unsupplied source pages and incomplete interpolation grids are rejected. Missing
accelerate-stop values remain missing. A detected registration mismatch blocks
that import batch. Existing reviewed profiles are not replaced; repeated imports
of the same named figures/document hash are skipped.

Generated profiles are saved automatically as **unverified drafts**. Use **Edit
profile** to compare each row and all conditions with the source POH and enable
the profile for Briefing. Graph digitization is approximate; a successful schema
validation does not establish the accuracy of the AI's readings. Worked-example
profiles permit only exact lookup and do not represent a full performance envelope.
The original extraction evidence remains available after manual edits, labelled
as original evidence. Switching source documents removes old extraction metadata.

Manual profile entry and CSV import remain available. Units are kg, feet
pressure altitude, °C, knots, percent slope, and metres distance. Positive wind
means headwind and positive slope means uphill. `distanceM` includes the stated
obstacle height; `accelerateStopM` can be empty and is never estimated.

Each profile is restricted to its documented configuration, surface and condition.
Exact-row lookup is the default. Multilinear interpolation can be enabled only
when appropriate to the source POH. The engine requires every surrounding grid
corner and never extrapolates. A single value on an axis supports only that exact
value, not arbitrary conditions. Nonlinear charts or aircraft-specific correction
procedures must first be converted to applicable verified data; the app does not
apply generic correction factors. Editing a profile clears its verified status.

### Automatic reader setup

Set these **server-side** environment variables in Netlify (and `.env.local` for
local Vite development), then redeploy/restart:

```text
OPENAI_API_KEY=...
POH_OPENAI_MODEL=gpt-4.1
POH_ALLOWED_UIDS=optional,comma-separated,Firebase-user-IDs
```

Never use a `VITE_` prefix for the API key. It must not be shipped in browser code.
The model is configurable; use an image-capable Responses model supporting strict
JSON Schema outputs. The application sends selected JPEG page images and limited
supporting text to the OpenAI Responses API with `store: false`. The UI discloses
this before processing. No live model call was performed during implementation
because the local environment had no API key configured.

`GET /api/poh-import` checks readiness after Firebase sign-in verification.
`POST /api/poh-import` accepts only inline JPEGs (no arbitrary document URLs), at
most four pages and a 5 MB request. The endpoint validates Firebase tokens against
the configured project, supports the UID allowlist, and has a best-effort
per-instance limit of 12 batches / 10 minutes per user and one active request per
user. In a scaled deployment, use provider project budgets and a shared rate limit
if stronger account-wide usage limits are needed. The image-provider request has
a 45-second timeout; ensure the deployed function runtime permits it. Timeouts,
missing configuration and rejected rows are surfaced without activating profiles.
Successful batches survive a later batch failure; failed saves can be retried
without re-running the image model.

Reopening an existing PDF downloads it through Firebase Storage. If browser CORS
blocks this, configure the bucket for the deployed application origin. A just-
uploaded PDF uses its local File object for analysis and does not download again.

API references: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Firebase token/account lookup](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info).

The briefing uses the selected aircraft and departure/arrival runway selections.
Airport elevation and matching-airport weather populate editable inputs. Pressure
altitude is an ISA estimate and may be overridden with the applicable value.
The user enters takeoff/landing weight and verifies conditions. The optional
planning factor defaults to 1 (no extra margin); required distances round upward.

The existing runway feed supplies physical length, **not published declared
distances**. TORA/TODA/ASDA/LDA must be entered for the selected runway direction
with an AIP/NOTAM source reference and confirmed. These session inputs reset when
aircraft, airport, runway or profile changes. Missing values remain unassessed.
Distance comparisons are not a complete takeoff/landing approval or obstacle
assessment. No actual aircraft performance data are bundled.

Definition reference: [FAA AIM, Airport Operations — Declared Distances](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_3.html).

## Verification

`npm test` includes synthetic performance fixtures: five-dimensional interpolation,
exact lookup, incomplete grids, extrapolation rejection, missing accelerate-stop
data, CSV validation, pressure altitude and runway distance margins.
It also tests POH chart classification, page grouping, source-unit conversion,
provenance validation, unverified output, malformed extraction rejection and the
authenticated server request using a mocked image provider.

`node tests/aircraft.ui.test.mjs` runs the Chromium workflow with a mocked repository:
aircraft creation, file attachment, verified profile entry, distance comparisons,
missing POH accelerate-stop data, condition invalidation, runway changes and mobile
width. It requires the Playwright Chromium browser. Optional screenshots are saved
under `/tmp`; if available, styles are loaded from `/tmp/vfrplanner-aircraft-build`.

`node tests/poh.ui.test.mjs /path/to/HABEYPOH_2024completed.pdf` exercises the actual
424-page sample in Chromium: text scanning, chart selection, rotation/rendering,
three image batches, draft saves, source previews, missing-key handling and mobile
layout. Firebase and model responses are mocked; the PDF remains local. This test
validates the processing workflow, **not the model's numerical chart-reading
accuracy**. Screenshots go to `/tmp/poh-import-review.png`.

Cloud integration requires the configured Firebase project's authentication,
Firestore and Storage rules. A local build alone does not verify cloud access.
