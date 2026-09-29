import type { ApiCluster, ApiPod } from "../types/api";
import type { TopologyNode, TopologyEdge, TopologyGraph, TopologyNodeType } from "../types/topology";
import type { LayoutLink, LayoutNode } from "./layout/types";
import { INTERNET_KEY, STATE_COLORS, STATE_LABELS, objectKey, parseKey, podDisplayName } from "./objectKey";

const COLORS: Record<Exclude<TopologyNodeType, "pod">, { color: string; glow: string }> = {
  internet: { color: "#00d4ff", glow: "#0088dd" },
  loadbalancer: { color: "#f472b6", glow: "#ec4899" },
  ingress: { color: "#a78bfa", glow: "#7c3aed" },
  service: { color: "#38bdf8", glow: "#0284c7" },
  deployment: { color: "#fb923c", glow: "#ea580c" },
};

const EDGE_COLORS: Record<TopologyEdge["type"], string> = {
  internet: "#00d4ff",
  lb: "#f472b6",
  ingress: "#a78bfa",
  service: "#38bdf8",
  owns: "#5bffb0",
};

const TIER: Record<TopologyNodeType, number> = {
  internet: 0,
  loadbalancer: 1,
  ingress: 2,
  service: 3,
  deployment: 4,
  pod: 5,
};

const SIZE: Record<TopologyNodeType, number> = {
  internet: 30,
  loadbalancer: 20,
  ingress: 18,
  service: 15,
  deployment: 16,
  pod: 12,
};

// Short, strong links keep a Deployment's pods tight around it; routing links
// are looser so namespaces can spread.
const LINK: Record<TopologyEdge["type"], { distance: number; strength: number }> = {
  internet: { distance: 120, strength: 0.05 },
  lb: { distance: 90, strength: 0.1 },
  ingress: { distance: 60, strength: 0.3 },
  service: { distance: 45, strength: 0.5 },
  owns: { distance: 28, strength: 0.8 },
};

type PartialNode = Omit<TopologyNode, "size" | "group" | "tier" | "parent">;

export function transformTopology(apiCluster: ApiCluster): TopologyGraph {
  const podsByKey = new Map(apiCluster.pods.map((p) => [p.key, p]));
  const deploymentsByKey = new Map(apiCluster.deployments.map((d) => [d.key, d]));
  const lbsByKey = new Map(apiCluster.loadBalancers.map((lb) => [lb.key, lb]));

  const nodes = new Map<string, PartialNode>();
  const edges = new Map<string, TopologyEdge>();

  const addEdge = (from: string, to: string, type: TopologyEdge["type"], active: boolean) => {
    const id = `${from}|${to}`;
    const existing = edges.get(id);
    if (existing) {
      existing.active = existing.active || active;
      return;
    }
    edges.set(id, { from, to, type, active, color: EDGE_COLORS[type] });
  };

  const addKindNode = (key: string, type: Exclude<TopologyNodeType, "pod" | "deployment">) => {
    if (nodes.has(key)) return;
    const { namespace, name } = parseKey(key);
    const lb = lbsByKey.get(key);
    nodes.set(key, {
      id: key,
      type,
      name: type === "internet" ? "INTERNET" : lb?.displayName ?? name,
      namespace: type === "loadbalancer" ? undefined : namespace,
      ...COLORS[type],
      metadata: lb?.address ? { address: lb.address } : undefined,
    });
  };

  const addDeploymentNode = (key: string) => {
    if (nodes.has(key)) return;
    const dep = deploymentsByKey.get(key);
    const { namespace, name } = parseKey(key);
    nodes.set(key, {
      id: key,
      type: "deployment",
      name,
      namespace,
      ...COLORS.deployment,
      state: dep?.state,
      status: dep ? `${dep.ready}/${dep.desired} ready` : undefined,
      metadata: dep ? { desired: dep.desired, ready: dep.ready, available: dep.available } : undefined,
    });
  };

  const addPodNode = (pod: ApiPod) => {
    if (nodes.has(pod.key)) return;
    nodes.set(pod.key, {
      id: pod.key,
      type: "pod",
      name: podDisplayName(pod),
      namespace: pod.namespace,
      ...STATE_COLORS[pod.state],
      state: pod.state,
      status: STATE_LABELS[pod.state],
      metadata: { version: pod.version, nodeId: pod.nodeId },
    });
  };

  for (const link of apiCluster.topology) {
    switch (link.type) {
      case "internet":
        addKindNode(INTERNET_KEY, "internet");
        addKindNode(link.to, "loadbalancer");
        addEdge(link.from, link.to, "internet", link.active);
        break;
      case "lb": {
        addKindNode(link.from, "loadbalancer");
        const toKind = parseKey(link.to).kind;
        addKindNode(link.to, toKind === "ingress" ? "ingress" : "service");
        addEdge(link.from, link.to, "lb", link.active);
        break;
      }
      case "ingress":
        addKindNode(link.from, "ingress");
        addKindNode(link.to, "service");
        addEdge(link.from, link.to, "ingress", link.active);
        break;
      case "service": {
        const pod = podsByKey.get(link.to);
        if (!pod) break; // endpoint for a pod the cache has not seen yet
        addKindNode(link.from, "service");
        addPodNode(pod);
        if (pod.owner.kind === "Deployment" && pod.owner.name) {
          const depKey = objectKey("deployment", pod.namespace, pod.owner.name);
          addDeploymentNode(depKey);
          addEdge(link.from, depKey, "service", link.active);
          addEdge(depKey, pod.key, "owns", link.active);
        } else {
          addEdge(link.from, pod.key, "service", link.active);
        }
        break;
      }
    }
  }

  const outgoing = new Map<string, number>();
  for (const e of edges.values()) outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);

  const parentOf = new Map<string, string>();
  for (const e of edges.values()) if (!parentOf.has(e.to)) parentOf.set(e.to, e.from);

  const placed: TopologyNode[] = [...nodes.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({
      ...n,
      group: n.namespace ?? "_",
      tier: TIER[n.type],
      parent: parentOf.get(n.id),
      size: SIZE[n.type],
      metadata: { ...n.metadata, connections: Math.max(1, outgoing.get(n.id) ?? 0) },
    }));

  return { nodes: placed, edges: [...edges.values()] };
}

export function topologyLayoutInput(graph: TopologyGraph): { nodes: LayoutNode[]; links: LayoutLink[] } {
  return {
    nodes: graph.nodes.map((n) => ({ key: n.id, group: n.group, cluster: "_", tier: n.tier, radius: n.size, parent: n.parent })),
    links: graph.edges.map((e) => ({ source: e.from, target: e.to, ...LINK[e.type] })),
  };
}
