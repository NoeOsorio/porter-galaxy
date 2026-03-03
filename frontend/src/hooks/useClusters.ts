import { useQuery } from "@tanstack/react-query";
import { fetchClusters } from "../lib/api";

export function useClusters() {
  return useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
