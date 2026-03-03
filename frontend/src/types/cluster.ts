export type DrillLevel = "cluster" | "node" | "deployment" | "pod";

export interface ClusterEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  level: "cluster";
  children: NodeEntity[];
}

export interface NodeEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  level: "node";
  children: DeploymentEntity[];
}

export interface DeploymentEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  level: "deployment";
  replicas?: number;
  children: PodEntity[];
}

export interface PodEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  level: "pod";
  status?: string;
}

export type ClusterHierarchyEntity =
  | ClusterEntity
  | NodeEntity
  | DeploymentEntity
  | PodEntity;

export interface BreadcrumbEntry {
  level: DrillLevel;
  id: string;
  label: string;
}
