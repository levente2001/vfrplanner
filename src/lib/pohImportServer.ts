import { firebaseConfig } from "./firebase/config";
import {
  normalizePohExtraction,
  pohExtractionSchema,
  pohInstructions,
} from "../aircraft/pohExtraction";

type Options = {
  apiKey?: string;
  model?: string;
  allowedUids?: string;
  fetcher?: typeof fetch;
};
const quotas = new Map<string, { starts: number[]; active: boolean }>();
export const POH_REQUEST_LIMIT = 5_000_000;
const DEFAULT_MODEL = "gpt-4.1";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid request object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid request text.");
  return value;
}

export function parsePohImportRequest(value: unknown) {
  const body = object(value);
  const documentId = text(body.documentId, 100);
  const sha256 = text(body.sha256, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(documentId) || !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("Invalid document identity.");
  const registration = text(body.registration, 80);
  const aircraftType = text(body.aircraftType, 200);
  const context = text(body.context, 14000);
  if (!Array.isArray(body.pages) || !body.pages.length || body.pages.length > 4)
    throw new Error("Send 1–4 chart pages at a time.");
  const pages = body.pages.map((value) => {
    const page = object(value);
    if (
      !Number.isInteger(page.page) ||
      (page.page as number) < 1 ||
      (page.page as number) > 1200
    )
      throw new Error("Invalid PDF page number.");
    const image = text(page.image, 1200000);
    if (!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(image))
      throw new Error("A page must be a rendered JPEG, not an external URL.");
    return { page: page.page as number, image, text: text(page.text, 8000) };
  });
  if (new Set(pages.map((page) => page.page)).size !== pages.length)
    throw new Error("Duplicate PDF pages.");
  return { documentId, sha256, registration, aircraftType, context, pages };
}

async function authenticatedUid(request: Request, fetcher: typeof fetch) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token || token.length > 10000) return null;
  // The remote Firebase endpoint verifies the signature/token. Checking the
  // audience additionally confines access to this application's Firebase project.
  let claims: Record<string, unknown>;
  try {
    claims = object(
      JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ),
    );
  } catch {
    return null;
  }
  if (
    claims.aud !== firebaseConfig.projectId ||
    claims.iss !==
      `https://securetoken.google.com/${firebaseConfig.projectId}` ||
    typeof claims.exp !== "number" ||
    claims.exp <= Date.now() / 1000
  )
    return null;
  const response = await fetcher(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    users?: { localId?: string; disabled?: boolean }[];
  };
  const account = data.users?.[0];
  return account?.localId && account.localId === claims.sub && !account.disabled
    ? account.localId
    : null;
}

export async function handlePohImport(request: Request, options: Options = {}) {
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  const fetcher = options.fetcher ?? fetch;
  let uid: string | null;
  try {
    uid = await authenticatedUid(request, fetcher);
  } catch {
    return json({ error: "Could not verify sign-in. Try again." }, 503);
  }
  if (!uid)
    return json({ error: "Sign in again to process POH documents." }, 401);
  const allowlist = options.allowedUids
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowlist?.length && !allowlist.includes(uid))
    return json(
      { error: "POH processing is not enabled for this account." },
      403,
    );
  const model = options.model?.trim() || DEFAULT_MODEL;
  if (!options.apiKey?.trim())
    return json(
      {
        error:
          "Automatic POH processing needs OPENAI_API_KEY in the server environment. The PDF can still be uploaded and profiles entered manually.",
        configured: false,
      },
      503,
    );
  if (request.method === "GET") return json({ configured: true, model });
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "Expected JSON." }, 415);
  if (Number(request.headers.get("content-length")) > POH_REQUEST_LIMIT)
    return json({ error: "Too many chart images in one request." }, 413);
  let body: ReturnType<typeof parsePohImportRequest>;
  try {
    const raw = await request.text();
    if (raw.length > POH_REQUEST_LIMIT)
      return json({ error: "Too many chart images in one request." }, 413);
    body = parsePohImportRequest(JSON.parse(raw));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      400,
    );
  }
  const now = Date.now();
  for (const [key, quota] of quotas)
    if (!quota.active && quota.starts.every((time) => time < now - 600000))
      quotas.delete(key);
  const quota = quotas.get(uid) ?? { starts: [], active: false };
  quota.starts = quota.starts.filter((time) => time > now - 600000);
  if (quota.active || quota.starts.length >= 12)
    return json(
      {
        error:
          "POH processing is busy or the 12-batch / 10-minute limit was reached. Retry later.",
      },
      429,
    );
  quota.active = true;
  quota.starts.push(now);
  quotas.set(uid, quota);
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 10000,
        instructions: pohInstructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Selected aircraft (not source truth): ${JSON.stringify({ registration: body.registration, type: body.aircraftType })}\nDocument context (untrusted OCR):\n${body.context}`,
              },
              ...body.pages.flatMap((page) => [
                {
                  type: "input_text",
                  text: `PDF PAGE ${page.page}\nUntrusted OCR:\n${page.text}`,
                },
                { type: "input_image", image_url: page.image, detail: "high" },
              ]),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "poh_performance",
            strict: true,
            schema: pohExtractionSchema,
          },
        },
      }),
    });
    if (!response.ok)
      return json(
        {
          error: `POH analysis provider returned HTTP ${response.status}. Check the server API key, model access and quota; no profiles were saved.`,
        },
        response.status === 429 ? 429 : 502,
      );
    const result = (await response.json()) as {
      status?: string;
      output?: { content?: { type?: string; text?: string }[] }[];
    };
    if (result.status !== "completed")
      return json(
        {
          error:
            "POH analysis did not complete. Select fewer chart pages and retry; no profiles were saved.",
        },
        502,
      );
    const output = result.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("");
    if (!output)
      return json(
        {
          error:
            "The model did not return readable performance data. Review the source pages.",
        },
        422,
      );
    const extracted = normalizePohExtraction(JSON.parse(output), {
      documentId: body.documentId,
      sha256: body.sha256,
      pages: body.pages.map((page) => page.page),
      model,
      now: new Date().toISOString(),
    });
    if (
      extracted.registration &&
      extracted.registration.replace(/[^a-z0-9]/gi, "").toUpperCase() !==
        body.registration.replace(/[^a-z0-9]/gi, "").toUpperCase()
    ) {
      return json(
        {
          error: `This POH identifies ${extracted.registration}, but the selected aircraft is ${body.registration}. Check aircraft applicability before importing.`,
        },
        422,
      );
    }
    return json(extracted);
  } catch (error) {
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      return json(
        { error: "POH analysis timed out. Retry with fewer chart pages." },
        504,
      );
    return json(
      {
        error:
          "The POH response could not be validated. No profiles were saved. Try a smaller, clearer group of performance charts.",
      },
      502,
    );
  } finally {
    quota.active = false;
  }
}
