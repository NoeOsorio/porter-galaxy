export type K8sNodeKind = "Namespace" | "Deployment" | "Pod" | "Service" | "Ingress";

export interface K8sNodeBase {
  id: number;
  kind: K8sNodeKind;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  nsIndex: number;
  color: string;
  glow: string;
}

export interface K8sNamespaceNode extends K8sNodeBase {
  kind: "Namespace";
}

export interface K8sDeploymentNode extends K8sNodeBase {
  kind: "Deployment";
  namespace: string;
  replicas: number;
  containerNames: string[];
}

export interface K8sPodContainer {
  name: string;
  angle: number;
  dist: number;
}

export type PodStatus = "Running" | "Pending" | "CrashLoopBackOff";

export interface K8sPodNode extends K8sNodeBase {
  kind: "Pod";
  namespace: string;
  status: PodStatus;
  containerNames: string[];
  containers: K8sPodContainer[];
}

export interface K8sServiceNode extends K8sNodeBase {
  kind: "Service";
  namespace: string;
  serviceType: string;
}

export interface K8sIngressNode extends K8sNodeBase {
  kind: "Ingress";
  namespace: string;
}

export type K8sNode =
  | K8sNamespaceNode
  | K8sDeploymentNode
  | K8sPodNode
  | K8sServiceNode
  | K8sIngressNode;

export type K8sEdgeType = "ownership" | "service" | "ingress";

export interface K8sEdge {
  source: number;
  target: number;
  type: K8sEdgeType;
}

export interface NamespaceColor {
  name: string;
  color: string;
  glow: string;
}

export interface K8sGraph {
  nodes: K8sNode[];
  edges: K8sEdge[];
  namespaces: NamespaceColor[];
}

export type ProjectedK8sNode = K8sNode & {
  sx: number;
  sy: number;
  scale: number;
  depth: number;
};
