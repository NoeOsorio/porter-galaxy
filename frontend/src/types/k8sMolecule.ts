export type K8sMoleculeNodeKind = "Node" | "Deployment" | "Pod";

export interface K8sMoleculeNodeBase {
  id: string;
  kind: K8sMoleculeNodeKind;
  name: string;
  x: number;
  y: number;
  color: string;
  glow: string;
  size: number;
  userX?: number;
  userY?: number;
}

export interface K8sMoleculeClusterNode extends K8sMoleculeNodeBase {
  kind: "Node";
  deployments: K8sMoleculeDeploymentNode[];
}

export interface K8sMoleculeDeploymentNode extends K8sMoleculeNodeBase {
  kind: "Deployment";
  replicas: number;
  containerNames: string[];
  pods: K8sMoleculePodNode[];
  parentId: string;
}

export interface K8sMoleculePodNode extends K8sMoleculeNodeBase {
  kind: "Pod";
  status: "Running" | "Pending" | "CrashLoopBackOff";
  containerNames: string[];
  parentId: string;
}

export type K8sMoleculeNode =
  | K8sMoleculeClusterNode
  | K8sMoleculeDeploymentNode
  | K8sMoleculePodNode;

export interface K8sMoleculeEdge {
  source: string;
  target: string;
}

export interface K8sMoleculeGraph {
  nodes: K8sMoleculeNode[];
  edges: K8sMoleculeEdge[];
}
