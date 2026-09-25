import { handleAirspaceUsePlan } from "../../src/lib/airspaceUsePlan";
import { requestFromEvent, responseToEvent } from "./_request";

export default handleAirspaceUsePlan;

export async function handler(event: Parameters<typeof requestFromEvent>[0]) {
  return responseToEvent(
    await handleAirspaceUsePlan(requestFromEvent(event, "/api/airspace-use-plan")),
  );
}
