import type { ApiClustersResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function fetchClusters(): Promise<ApiClustersResponse> {
  const response = await fetch(`${API_URL}/api/clusters`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch clusters: ${response.statusText}`);
  }
  
  return response.json();
}
