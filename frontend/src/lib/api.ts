import type { ApiClustersResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL ?? "";

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
