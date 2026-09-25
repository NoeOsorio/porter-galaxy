import { useEffect, useState } from "react";
import { createClusterEventSource } from "../lib/api";
import type { ApiClustersResponse } from "../types/api";

export type Connection = "connecting" | "live" | "reconnecting" | "offline";

export interface ClustersStream {
  snapshot: ApiClustersResponse | null;
  connection: Connection;
  lastUpdate: Date | null;
}

const OFFLINE_AFTER_MS = 30_000;
const RETRY_CLOSED_MS = 3_000;

// Must be called once, at the app root: each call opens its own stream.
export function useClustersSSE(): ClustersStream {
  const [snapshot, setSnapshot] = useState<ApiClustersResponse | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const markDisconnected = () => {
      setConnection((c) => (c === "offline" ? c : "reconnecting"));
      offlineTimer ??= setTimeout(() => setConnection("offline"), OFFLINE_AFTER_MS);
    };

    const connect = () => {
      source = createClusterEventSource(
        (data) => {
          clearTimeout(offlineTimer);
          offlineTimer = undefined;
          setSnapshot(data);
          setLastUpdate(new Date());
          setConnection("live");
        },
        () => {
          markDisconnected();
          // EventSource retries on its own unless the server answered with a
          // non-200 status, which leaves it CLOSED for good.
          if (source?.readyState === EventSource.CLOSED && !disposed) {
            retryTimer = setTimeout(connect, RETRY_CLOSED_MS);
          }
        },
      );
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(offlineTimer);
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return { snapshot, connection, lastUpdate };
}
