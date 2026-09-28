import { useQuery } from "@tanstack/react-query";
import { listAircraft } from "./repository";

export const aircraftQueryKey = (uid: string | undefined) =>
  ["personal-aircraft", uid] as const;

export function useAircraft(uid: string | undefined) {
  return useQuery({
    queryKey: aircraftQueryKey(uid),
    queryFn: () => listAircraft(uid!),
    enabled: Boolean(uid),
  });
}
