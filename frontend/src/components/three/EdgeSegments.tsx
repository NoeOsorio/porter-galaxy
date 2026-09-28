import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { LayoutStore } from "../../lib/layout/layoutStore";

export interface EdgeList {
  from: string[];
  to: string[];
  /** Linear RGB per edge, 3 floats; dim edges are darkened instead of made transparent. */
  colors: Float32Array;
}

interface Props {
  store: LayoutStore;
  edges: EdgeList;
  /** Line width in CSS pixels. */
  width: number;
  opacity?: number;
}

/** Every edge of a set in one draw call, endpoints read from the layout store. */
export default function EdgeSegments({ store, edges, width, opacity = 1 }: Props) {
  const size = useThree((s) => s.size);
  const count = edges.from.length;

  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(new Float32Array(Math.max(count, 1) * 6));
    const material = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const segments = new LineSegments2(geometry, material);
    segments.frustumCulled = false;
    segments.raycast = () => {};
    return segments;
  }, [count, width, opacity]);

  useEffect(() => {
    const perVertex = new Float32Array(Math.max(count, 1) * 6);
    for (let i = 0; i < count; i++) {
      perVertex.set(edges.colors.subarray(i * 3, i * 3 + 3), i * 6);
      perVertex.set(edges.colors.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    }
    line.geometry.setColors(perVertex);
  }, [line, edges, count]);

  useEffect(() => {
    line.material.resolution.set(size.width, size.height);
  }, [line, size]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );

  const synced = useRef<{ version: number; edges: EdgeList | null; line: LineSegments2 | null }>({ version: -1, edges: null, line: null });
  useFrame(() => {
    const s = synced.current;
    if (s.version === store.version && s.edges === edges && s.line === line) return;
    s.version = store.version;
    s.edges = edges;
    s.line = line;

    const start = line.geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const buffer = start.data as THREE.InstancedInterleavedBuffer;
    const out = buffer.array as Float32Array;
    const src = store.positions;
    for (let i = 0; i < count; i++) {
      const a = store.index.get(edges.from[i]!);
      const b = store.index.get(edges.to[i]!);
      if (a === undefined || b === undefined) {
        out.fill(0, i * 6, i * 6 + 6);
        continue;
      }
      out[i * 6] = src[a * 3]!;
      out[i * 6 + 1] = src[a * 3 + 1]!;
      out[i * 6 + 2] = src[a * 3 + 2]!;
      out[i * 6 + 3] = src[b * 3]!;
      out[i * 6 + 4] = src[b * 3 + 1]!;
      out[i * 6 + 5] = src[b * 3 + 2]!;
    }
    buffer.needsUpdate = true;
  });

  return count > 0 ? <primitive object={line} /> : null;
}
