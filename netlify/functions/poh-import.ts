import { handlePohImport } from "../../src/lib/pohImportServer";
import { requestFromEvent, responseToEvent } from "./_request";

export default function handle(request: Request) {
  return handlePohImport(request, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.POH_OPENAI_MODEL,
    allowedUids: process.env.POH_ALLOWED_UIDS,
  });
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handle(requestFromEvent(event, "/api/poh-import")),
  );
}
