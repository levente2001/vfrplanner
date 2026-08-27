import { useQuery } from "@tanstack/react-query";

import type { FlightLoggerAircraft } from "../shared/aircraftTypes";

export type AircraftDetailApiResponse = {
  aircraft: FlightLoggerAircraft;
  maintenancePages: number;
  partial?: boolean;
  warning?: string;
};

export function useAircraftDetail(
  apiToken: string,
  callSign: string | null,
) {
  return useQuery({
    queryKey: [
      "aircraft-detail",
      Boolean(apiToken),
      callSign,
    ],

    queryFn: ({ signal }) =>
      fetchAircraftDetail(
        apiToken,
        callSign ?? "",
        signal,
      ),

    enabled:
      Boolean(apiToken) &&
      Boolean(callSign),

    staleTime: 30_000,

    placeholderData:
      (previous) =>
        previous,
  });
}

export async function fetchAircraftDetail(
  apiToken: string,
  callSign: string,
  signal?: AbortSignal,
): Promise<AircraftDetailApiResponse> {
  const params =
    new URLSearchParams({
      callSign,
    });

  const response =
    await fetch(
      `/api/aircraft-detail?${params.toString()}`,
      {
        signal,

        headers: {
          Authorization:
            `Bearer ${apiToken}`,
        },
      },
    );

  const payload =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    const mainMessage =
      payload?.error ??
      "Unable to load FlightLogger aircraft details.";

    const detail =
      payload?.detail;

    throw new Error(
      detail
        ? `${mainMessage} ${detail}`
        : mainMessage,
    );
  }

  return payload as AircraftDetailApiResponse;
}