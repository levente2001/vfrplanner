import { handleFlightLoggerBookings } from "../../src/lib/flightloggerBookings";
import { requestFromEvent, responseToEvent } from "./_request";

export default function handle(request: Request) {
  return handleFlightLoggerBookings(request);
}

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handleFlightLoggerBookings(requestFromEvent(event, "/api/bookings")),
  );
}
