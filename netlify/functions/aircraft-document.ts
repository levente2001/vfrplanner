import { firebaseConfig } from "../../src/lib/firebase/config";
import { requestFromEvent, responseToEvent } from "./_request";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function decodePayload(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function handle(request: Request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];

  if (!token) return json({ error: "Sign in again before downloading the POH." }, 401);

  const claims = decodePayload(token);
  const uid = typeof claims?.sub === "string" ? claims.sub : "";
  if (
    !uid ||
    claims?.aud !== firebaseConfig.projectId ||
    claims?.iss !== `https://securetoken.google.com/${firebaseConfig.projectId}` ||
    typeof claims?.exp !== "number" ||
    claims.exp <= Date.now() / 1000
  ) {
    return json({ error: "Invalid or expired Firebase session." }, 401);
  }

  const url = new URL(request.url);
  const storagePath = (url.searchParams.get("path") ?? "").trim();
  if (
    !storagePath ||
    !storagePath.startsWith(`users/${uid}/aircraft/`) ||
    storagePath.includes("..")
  ) {
    return json({ error: "Document path is not allowed for this account." }, 403);
  }

  const objectUrl =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(firebaseConfig.storageBucket ?? "")}/o/${encodeURIComponent(storagePath)}?alt=media`;

  try {
    const upstream = await fetch(objectUrl, {
      headers: {
        Authorization: `Firebase ${token}`,
        Accept: "*/*",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return json(
        {
          error:
            upstream.status === 403
              ? "Firebase Storage denied access to this document. Check Storage rules for the signed-in user."
              : `Firebase Storage download failed with HTTP ${upstream.status}.`,
          detail: detail.slice(0, 300) || undefined,
        },
        upstream.status === 401 || upstream.status === 403 ? upstream.status : 502,
      );
    }

    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "Content-Disposition": upstream.headers.get("content-disposition") || "inline",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not download the aircraft document.",
      },
      502,
    );
  }
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handle(requestFromEvent(event, "/api/aircraft-document")),
  );
}
