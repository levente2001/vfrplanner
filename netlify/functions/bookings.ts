import { handleFlightLoggerBookings } from "../../src/lib/flightloggerBookings";

export default function handler(request: Request) {
  return handleFlightLoggerBookings(request);
}
