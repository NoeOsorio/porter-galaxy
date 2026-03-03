import type { K8sGraph, K8sNode, K8sEdge, K8sPodNode, K8sPodContainer } from "../types/k8s";

const NAMESPACES: { name: string; color: string; glow: string }[] = [
  { name: "default", color: "#45caff", glow: "#0088dd" },
  { name: "kube-system", color: "#ff6b9d", glow: "#dd2266" },
  { name: "monitoring", color: "#ffd666", glow: "#cc9900" },
  { name: "production", color: "#5bffb0", glow: "#00cc66" },
  { name: "staging", color: "#7c6bff", glow: "#4422ee" },
];

const DEPLOYMENTS: { name: string; ns: string; replicas: number; containers: string[] }[] = [
  { name: "api-gateway", ns: "production", replicas: 3, containers: ["nginx", "envoy-sidecar"] },
  { name: "web-frontend", ns: "production", replicas: 2, containers: ["react-app"] },
  { name: "user-service", ns: "production", replicas: 3, containers: ["go-api", "redis-cache"] },
  { name: "order-service", ns: "production", replicas: 2, containers: ["node-api", "envoy-sidecar"] },
  { name: "payment-service", ns: "production", replicas: 2, containers: ["java-app", "vault-agent"] },
  { name: "grafana", ns: "monitoring", replicas: 1, containers: ["grafana"] },
  { name: "prometheus", ns: "monitoring", replicas: 2, containers: ["prometheus", "config-reload"] },
  { name: "loki", ns: "monitoring", replicas: 1, containers: ["loki"] },
  { name: "alertmanager", ns: "monitoring", replicas: 1, containers: ["alertmanager"] },
  { name: "coredns", ns: "kube-system", replicas: 2, containers: ["coredns"] },
  { name: "kube-proxy", ns: "kube-system", replicas: 3, containers: ["kube-proxy"] },
  { name: "etcd", ns: "kube-system", replicas: 3, containers: ["etcd"] },
  { name: "metrics-server", ns: "kube-system", replicas: 1, containers: ["metrics-server"] },
  { name: "test-api", ns: "staging", replicas: 1, containers: ["go-api"] },
  { name: "test-frontend", ns: "staging", replicas: 1, containers: ["react-app"] },
  { name: "test-db", ns: "staging", replicas: 1, containers: ["postgres"] },
  { name: "nginx-demo", ns: "default", replicas: 2, containers: ["nginx"] },
  { name: "redis", ns: "default", replicas: 1, containers: ["redis"] },
];

const SERVICES: { name: string; ns: string; type: string; targets: string[] }[] = [
  { name: "api-gateway-svc", ns: "production", type: "LoadBalancer", targets: ["api-gateway"] },
  { name: "web-frontend-svc", ns: "production", type: "ClusterIP", targets: ["web-frontend"] },
  { name: "user-svc", ns: "production", type: "ClusterIP", targets: ["user-service"] },
  { name: "order-svc", ns: "production", type: "ClusterIP", targets: ["order-service"] },
  { name: "payment-svc", ns: "production", type: "ClusterIP", targets: ["payment-service"] },
  { name: "grafana-svc", ns: "monitoring", type: "NodePort", targets: ["grafana"] },
  { name: "prometheus-svc", ns: "monitoring", type: "ClusterIP", targets: ["prometheus"] },
  { name: "kube-dns", ns: "kube-system", type: "ClusterIP", targets: ["coredns"] },
];

const INGRESSES: { name: string; ns: string; targets: string[] }[] = [
  { name: "main-ingress", ns: "production", targets: ["api-gateway-svc", "web-frontend-svc"] },
  { name: "monitoring-ingress", ns: "monitoring", targets: ["grafana-svc"] },
];

const POD_STATUSES: ("Running" | "Pending" | "CrashLoopBackOff")[] = [
  "Running",
  "Running",
  "Running",
  "Running",
  "Pending",
  "CrashLoopBackOff",
];

function nextId(nodes: K8sNode[]): number {
  return nodes.length;
}

export function generateK8sCluster(): K8sGraph {
  const nodes: K8sNode[] = [];
  const edges: K8sEdge[] = [];
  const nsMap: Record<string, number> = {};
  const deployMap: Record<string, number> = {};
  const svcMap: Record<string, number> = {};
  const namespaces = NAMESPACES.map((ns) => ({ ...ns }));

  const radius = 130;
  NAMESPACES.forEach((ns, i) => {
    const angle = (i / NAMESPACES.length) * Math.PI * 2 - Math.PI / 2;
    const id = nextId(nodes);
    nsMap[ns.name] = id;
    nodes.push({
      id,
      kind: "Namespace",
      name: ns.name,
      x: Math.cos(angle) * (radius + Math.random() * 25),
      y: Math.sin(angle) * (radius + Math.random() * 25),
      z: (Math.random() - 0.5) * 20,
      size: 6,
      nsIndex: i,
      color: ns.color,
      glow: ns.glow,
      vx: 0,
      vy: 0,
    });
  });

  DEPLOYMENTS.forEach((dep) => {
    const nsNode = nodes[nsMap[dep.ns]]!;
    const nsIdx = nsNode.nsIndex;
    const angle = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 22;
    const id = nextId(nodes);
    deployMap[`${dep.ns}/${dep.name}`] = id;

    nodes.push({
      id,
      kind: "Deployment",
      name: dep.name,
      namespace: dep.ns,
      x: nsNode.x + Math.cos(angle) * dist,
      y: nsNode.y + Math.sin(angle) * dist,
      z: nsNode.z + (Math.random() - 0.5) * 12,
      size: 4,
      nsIndex: nsIdx,
      color: namespaces[nsIdx].color,
      glow: namespaces[nsIdx].glow,
      replicas: dep.replicas,
      containerNames: dep.containers,
      vx: 0,
      vy: 0,
    });

    edges.push({ source: nsMap[dep.ns]!, target: id, type: "ownership" });

    for (let r = 0; r < dep.replicas; r++) {
      const podAngle = (r / dep.replicas) * Math.PI * 2 + Math.random() * 0.3;
      const podDist = 8 + Math.random() * 12;
      const parent = nodes[id]!;
      const podId = nextId(nodes);
      const status = POD_STATUSES[Math.floor(Math.random() * POD_STATUSES.length)]!;
      const containers: K8sPodContainer[] = dep.containers.map((name, ci) => ({
        name,
        angle: (ci / dep.containers.length) * Math.PI * 2,
        dist: 3 + Math.random() * 1.5,
      }));

      nodes.push({
        id: podId,
        kind: "Pod",
        name: `${dep.name}-${Math.random().toString(36).slice(2, 7)}`,
        namespace: dep.ns,
        x: parent.x + Math.cos(podAngle) * podDist,
        y: parent.y + Math.sin(podAngle) * podDist,
        z: parent.z + (Math.random() - 0.5) * 6,
        size: 2.2,
        nsIndex: nsIdx,
        color: namespaces[nsIdx].color,
        glow: namespaces[nsIdx].glow,
        status,
        containerNames: dep.containers,
        containers,
        vx: 0,
        vy: 0,
      } as K8sPodNode);

      edges.push({ source: id, target: podId, type: "ownership" });
    }
  });

  SERVICES.forEach((svc) => {
    const nsNode = nodes[nsMap[svc.ns]]!;
    const nsIdx = nsNode.nsIndex;
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 18;
    const id = nextId(nodes);
    svcMap[`${svc.ns}/${svc.name}`] = id;

    nodes.push({
      id,
      kind: "Service",
      name: svc.name,
      namespace: svc.ns,
      x: nsNode.x + Math.cos(angle) * dist,
      y: nsNode.y + Math.sin(angle) * dist,
      z: nsNode.z + (Math.random() - 0.5) * 10,
      size: 3,
      nsIndex: nsIdx,
      color: namespaces[nsIdx].color,
      glow: namespaces[nsIdx].glow,
      serviceType: svc.type,
      vx: 0,
      vy: 0,
    });

    for (const t of svc.targets) {
      const depId = deployMap[`${svc.ns}/${t}`];
      if (depId === undefined) continue;
      for (const n of nodes) {
        if (n.kind === "Pod" && n.namespace === svc.ns && n.name.startsWith(t)) {
          edges.push({ source: id, target: n.id, type: "service" });
        }
      }
    }
  });

  INGRESSES.forEach((ing) => {
    const nsNode = nodes[nsMap[ing.ns]]!;
    const nsIdx = nsNode.nsIndex;
    const angle = Math.atan2(nsNode.y, nsNode.x);
    const id = nextId(nodes);

    nodes.push({
      id,
      kind: "Ingress",
      name: ing.name,
      namespace: ing.ns,
      x: Math.cos(angle) * 280,
      y: Math.sin(angle) * 280,
      z: 0,
      size: 4.5,
      nsIndex: nsIdx,
      color: "#ffffff",
      glow: namespaces[nsIdx].glow,
      vx: 0,
      vy: 0,
    });

    for (const t of ing.targets) {
      const svcId = svcMap[`${ing.ns}/${t}`];
      if (svcId !== undefined) edges.push({ source: id, target: svcId, type: "ingress" });
    }
  });

  return { nodes, edges, namespaces };
}

export interface ForceStepOptions {
  focusNamespace?: string;
  zoomLevel?: number;
}

export function forceStepK8s(
  nodes: K8sNode[],
  edges: K8sEdge[],
  alpha = 0.008,
  options?: ForceStepOptions
): void {
  const focused = options?.focusNamespace;
  const zoom = Math.max(0.5, Math.min(3, options?.zoomLevel ?? 1));
  const spread = 1 + 1.2 * Math.min(zoom, 2.5);

  const baseRepulsion = focused ? 900 : 500;
  const repulsion = baseRepulsion * spread;
  const invSpread = 1 / spread;
  const attractionOwnership = (focused ? 0.0009 : 0.0018) * invSpread;
  const attractionService = (focused ? 0.00025 : 0.0004) * invSpread;
  const attractionIngress = (focused ? 0.0002 : 0.00035) * invSpread;
  const centerGravity = 0.0003;

  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i]!;
    let fx = 0,
      fy = 0;

    fx -= ni.x * centerGravity;
    fy -= ni.y * centerGravity;

    for (let s = 0; s < 25; s++) {
      const j = Math.floor(Math.random() * nodes.length);
      if (i === j) continue;
      const nj = nodes[j]!;
      const dx = ni.x - nj.x;
      const dy = ni.y - nj.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const force = repulsion / (dist * dist);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    }

    ni.vx = (ni.vx || 0) * 0.88 + fx * alpha;
    ni.vy = (ni.vy || 0) * 0.88 + fy * alpha;
    ni.x += ni.vx;
    ni.y += ni.vy;
  }

  for (const e of edges) {
    const s = nodes[e.source];
    const t = nodes[e.target];
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const mult =
      e.type === "ownership"
        ? attractionOwnership
        : e.type === "service"
          ? attractionService
          : attractionIngress;
    const force = dist * mult;
    s.vx += dx * force;
    s.vy += dy * force;
    t.vx -= dx * force;
    t.vy -= dy * force;
  }
}
