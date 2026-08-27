import { handleFlightLoggerAircrafts } from "../../src/lib/flightloggerAircrafts";

export default function handler(request: Request) {
  return handleFlightLoggerAircrafts(request);
}
