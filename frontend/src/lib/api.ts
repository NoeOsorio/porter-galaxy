import type { ApiClustersResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function fetchClusters(): Promise<ApiClustersResponse> {
  const response = await fetch(`${API_URL}/api/v1/clusters`);

  if (!response.ok) {
    throw new Error(`Failed to fetch clusters: ${response.statusText}`);
  }

  return response.json();
}

export function createClusterEventSource(
  onMessage: (data: ApiClustersResponse) => void,
  onError: (error: Error) => void
): EventSource {
  const eventSource = new EventSource(`${API_URL}/api/v1/clusters`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ApiClustersResponse;
      onMessage(data);
    } catch (error) {
      onError(new Error(`Failed to parse SSE data: ${error}`));
    }
  };

  eventSource.onerror = () => {
    onError(new Error("SSE connection error"));
  };

  return eventSource;
}
