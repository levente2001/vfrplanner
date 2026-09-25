import { handleRouteNotams } from "../../src/lib/routeNotamsServer";
import { requestFromEvent, responseToEvent } from "./_request";

function runtimeEnv() {
  return (
    (
      globalThis as unknown as {
        process?: {
          env?: Record<string, string | undefined>;
        };
      }
    ).process?.env ?? {}
  );
}

export default function handle(request: Request) {
  return handleRouteNotams(request, {
    apiKey: runtimeEnv().SKYLINK_API_KEY,
  });
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(await handle(requestFromEvent(event, "/api/notams")));
}
