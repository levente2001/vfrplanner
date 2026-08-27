import { handleFlightLoggerAircraftDetail } from "../../src/lib/flightloggerAircraftDetail";

export default function handler(request: Request) {
  return handleFlightLoggerAircraftDetail(request);
}
