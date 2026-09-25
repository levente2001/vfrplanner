import { handleFlightLoggerAircraftDetail } from "../../src/lib/flightloggerAircraftDetail";
import { requestFromEvent, responseToEvent } from "./_request";

export default function handle(request: Request) {
  return handleFlightLoggerAircraftDetail(request);
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handleFlightLoggerAircraftDetail(
      requestFromEvent(event, "/api/aircraft-detail"),
    ),
  );
}
