// d3-force-3d ships no types; these cover only what lib/layout/layout.worker.ts uses.
declare module "d3-force-3d" {
  export interface SimulationNode {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface SimulationLink<N> {
    source: N | string;
    target: N | string;
  }

  type Accessor<N, T> = T | ((node: N, i: number, nodes: N[]) => T);

  export interface Force<N> {
    (alpha: number): void;
    initialize?(nodes: N[]): void;
  }

  export interface Simulation<N extends SimulationNode> {
    nodes(): N[];
    nodes(nodes: N[]): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaMin(min: number): this;
    alphaDecay(decay: number): this;
    velocityDecay(decay: number): this;
    force(name: string, force: Force<N> | null): this;
    tick(iterations?: number): this;
    stop(): this;
  }

  export interface LinkForce<N, L> extends Force<N> {
    links(links: L[]): this;
    id(id: (node: N) => string): this;
    distance(distance: Accessor<L, number>): this;
    strength(strength: Accessor<L, number>): this;
  }

  export interface ManyBodyForce<N> extends Force<N> {
    strength(strength: Accessor<N, number>): this;
    theta(theta: number): this;
    distanceMax(distance: number): this;
  }

  export interface CollideForce<N> extends Force<N> {
    radius(radius: Accessor<N, number>): this;
    strength(strength: number): this;
  }

  export interface PositionForce<N> extends Force<N> {
    strength(strength: Accessor<N, number>): this;
  }

  export function forceSimulation<N extends SimulationNode>(nodes?: N[], numDimensions?: 1 | 2 | 3): Simulation<N>;
  export function forceLink<N extends SimulationNode, L extends SimulationLink<N>>(links?: L[]): LinkForce<N, L>;
  export function forceManyBody<N extends SimulationNode>(): ManyBodyForce<N>;
  export function forceCollide<N extends SimulationNode>(radius?: Accessor<N, number>): CollideForce<N>;
  export function forceX<N extends SimulationNode>(x?: Accessor<N, number>): PositionForce<N>;
  export function forceY<N extends SimulationNode>(y?: Accessor<N, number>): PositionForce<N>;
  export function forceZ<N extends SimulationNode>(z?: Accessor<N, number>): PositionForce<N>;
}
