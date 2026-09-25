import { handleFlightLoggerAircrafts } from "../../src/lib/flightloggerAircrafts";
import { requestFromEvent, responseToEvent } from "./_request";

export default function handle(request: Request) {
  return handleFlightLoggerAircrafts(request);
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handleFlightLoggerAircrafts(
      requestFromEvent(event, "/api/aircrafts"),
    ),
  );
}
