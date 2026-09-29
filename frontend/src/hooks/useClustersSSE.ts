import { useEffect, useState } from "react";
import { applyPatch, createClusterEventSource } from "../lib/api";
import { fetchSession } from "./useSession";
import type { ApiClustersResponse } from "../types/api";

export type Connection = "connecting" | "live" | "reconnecting" | "offline";

export interface ClustersStream {
  snapshot: ApiClustersResponse | null;
  connection: Connection;
  lastUpdate: Date | null;
}

const OFFLINE_AFTER_MS = 30_000;
const RETRY_CLOSED_MS = 3_000;
const STATS = new URLSearchParams(window.location.search).has("stats");

// Must be called once, at the app root: each call opens its own stream.
// onUnauthorized fires when the stream fails because the session ended.
export function useClustersSSE(onUnauthorized: () => void): ClustersStream {
  const [snapshot, setSnapshot] = useState<ApiClustersResponse | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let current: ApiClustersResponse | null = null;
    let version = -1;
    const bytes = { snapshot: 0, patch: 0 };
    const statsTimer = STATS
      ? setInterval(() => {
          console.log(`[galaxy] stream bytes/min: ${bytes.snapshot + bytes.patch} (snapshot ${bytes.snapshot}, patch ${bytes.patch})`);
          bytes.snapshot = bytes.patch = 0;
        }, 60_000)
      : undefined;

    const show = (data: ApiClustersResponse) => {
      clearTimeout(offlineTimer);
      offlineTimer = undefined;
      current = data;
      setSnapshot(data);
      setLastUpdate(new Date());
      setConnection("live");
    };

    const markDisconnected = () => {
      setConnection((c) => (c === "offline" ? c : "reconnecting"));
      offlineTimer ??= setTimeout(() => setConnection("offline"), OFFLINE_AFTER_MS);
    };

    const connect = () => {
      source = createClusterEventSource({
        onSnapshot: (data, size) => {
          bytes.snapshot += size;
          version = data.version;
          show({ clusters: data.clusters });
        },
        onPatch: (data, size) => {
          bytes.patch += size;
          // A patch for another base would corrupt the graph; a new
          // connection starts from a fresh snapshot instead.
          if (!current || data.base !== version) {
            source?.close();
            connect();
            return;
          }
          version = data.version;
          show(applyPatch(current, data));
        },
        onError: () => {
          markDisconnected();
          // EventSource hides the status of a failed reconnect; the session
          // endpoint tells an expired session apart from a backend outage.
          fetchSession()
            .then((s) => {
              if (s.status === "signed-out" && !disposed) {
                source?.close();
                onUnauthorized();
              }
            })
            .catch(() => undefined);
          // EventSource retries on its own unless the server answered with a
          // non-200 status, which leaves it CLOSED for good.
          if (source?.readyState === EventSource.CLOSED && !disposed) {
            retryTimer = setTimeout(connect, RETRY_CLOSED_MS);
          }
        },
      });
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(offlineTimer);
      clearTimeout(retryTimer);
      clearInterval(statsTimer);
      source?.close();
    };
  }, [onUnauthorized]);

  return { snapshot, connection, lastUpdate };
}
