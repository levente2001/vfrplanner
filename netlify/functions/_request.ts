type NetlifyEvent = {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | null> | null;
  rawUrl?: string;
};

type LegacyResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
};

export function requestFromEvent(event: NetlifyEvent, path: string) {
  const url = event.rawUrl ?? `https://localhost${path}${queryString(event)}`;
  const method = event.httpMethod ?? "GET";
  const headers = new Headers();

  Object.entries(event.headers ?? {}).forEach(([key, value]) => {
    if (value !== undefined) headers.set(key, value);
  });

  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64")
        : event.body;

  return new Request(url, {
    body,
    headers,
    method,
  });
}

export async function responseToEvent(response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      statusCode: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()).toString("base64"),
      isBase64Encoded: true,
    } satisfies LegacyResponse;
  }

  return {
    statusCode: response.status,
    headers,
    body: await response.text(),
  } satisfies LegacyResponse;
}

function queryString(event: NetlifyEvent) {
  const params = new URLSearchParams();

  Object.entries(event.queryStringParameters ?? {}).forEach(([key, value]) => {
    if (value !== null) params.set(key, value);
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}
