import { useQuery } from "@tanstack/react-query";
import type { BookingsApiResponse, BookingsFilters } from "../shared/types";

export function useBookings(filters: BookingsFilters, apiToken: string) {
  return useQuery({
    queryKey: ["bookings", filters, Boolean(apiToken)],
    queryFn: ({ signal }) => fetchBookings(filters, apiToken, signal),
    enabled: Boolean(apiToken),
    placeholderData: (previous) => previous,
  });
}

export async function fetchBookings(
  filters: BookingsFilters,
  apiToken: string,
  signal?: AbortSignal,
): Promise<BookingsApiResponse> {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
  });

  if (filters.statuses.length)
    params.set("statuses", filters.statuses.join(","));
  if (filters.subtypes.length)
    params.set("subtypes", filters.subtypes.join(","));
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.changedAfter) params.set("changedAfter", filters.changedAfter);

  const response = await fetch(`/api/bookings?${params}`, {
    signal,
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to load FlightLogger bookings.");
  }

  return payload as BookingsApiResponse;
}
