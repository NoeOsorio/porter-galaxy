import { useState, useEffect, useRef } from "react";
import { createClusterEventSource } from "../lib/api";
import type { ApiClustersResponse } from "../types/api";

interface UseClustersSSEResult {
  data: ApiClustersResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isConnected: boolean;
}

export function useClustersSSE(): UseClustersSSEResult {
  const [data, setData] = useState<ApiClustersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const handleMessage = (newData: ApiClustersResponse) => {
      setData(newData);
      setIsLoading(false);
      setIsError(false);
      setError(null);
      setIsConnected(true);
    };

    const handleError = (err: Error) => {
      setIsError(true);
      setError(err);
      setIsLoading(false);
      setIsConnected(false);
    };

    eventSourceRef.current = createClusterEventSource(handleMessage, handleError);

    const eventSource = eventSourceRef.current;

    eventSource.addEventListener("open", () => {
      setIsConnected(true);
    });

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  return {
    data,
    isLoading,
    isError,
    error,
    isConnected,
  };
}
