import { useQuery } from "@tanstack/react-query";
import type { AircraftApiResponse } from "../shared/aircraftTypes";

export function useAircrafts(apiToken: string, search: string) {
  return useQuery({
    queryKey: ["aircrafts", Boolean(apiToken), search.trim().toLowerCase()],
    queryFn: ({ signal }) => fetchAircrafts(apiToken, search, signal),
    enabled: Boolean(apiToken),
    placeholderData: (previous) => previous,
  });
}

export async function fetchAircrafts(
  apiToken: string,
  search: string,
  signal?: AbortSignal,
): Promise<AircraftApiResponse> {
  const response = await fetch("/api/aircrafts", {
    signal,
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to load FlightLogger aircraft.");
  }

  const data = payload as AircraftApiResponse;
  if (search.trim()) {
    const query = search.trim().toLowerCase();
    return {
      ...data,
      aircraft: data.aircraft.filter((aircraft) =>
        [aircraft.callSign, aircraft.model, aircraft.aircraftClass]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
    };
  }

  return data;
}
