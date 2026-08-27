const LLSIGWX_PDF_URL = "https://www.netbriefing.hu/Kepek/MET/LLSIGWX.pdf";
const USER_AGENT = "VFRPlanner/1.0 aviation-weather-client";

export default async function handler() {
  try {
    const response = await fetch(LLSIGWX_PDF_URL, {
      headers: {
        Accept: "application/pdf",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `LLSIGWX HTTP ${response.status}` }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="LLSIGWX.pdf"',
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
    });
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    if (etag) headers.set("ETag", etag);
    if (lastModified) headers.set("Last-Modified", lastModified);

    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "LLSIGWX chart request failed.",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
