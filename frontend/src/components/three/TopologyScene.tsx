import { useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TopologyNode, TopologyEdge, TopologyGraph } from "../../types/topology";

interface TopologySceneProps {
  graph: TopologyGraph;
  onHover: (node: TopologyNode | null) => void;
  onClick: (node: TopologyNode | null) => void;
}

export default function TopologyScene({
  graph,
  onHover,
  onClick,
}: TopologySceneProps) {
  const { gl } = useThree();
  const nodesRef = useRef<THREE.Group>(null);
  const edgesRef = useRef<THREE.Group>(null);

  const handlePointerOut = useCallback(() => {
    onHover(null);
    gl.domElement.style.cursor = "default";
  }, [onHover, gl]);

  const nodesByType = useMemo(() => {
    const grouped = new Map<string, TopologyNode[]>();
    graph.nodes.forEach((node) => {
      const list = grouped.get(node.type) || [];
      list.push(node);
      grouped.set(node.type, list);
    });
    return Array.from(grouped.entries());
  }, [graph.nodes]);

  useFrame(({ clock }) => {
    if (edgesRef.current) {
      edgesRef.current.children.forEach((line, i) => {
        const edge = graph.edges[i];
        if (edge?.active) {
          const material = (line as THREE.Line).material as THREE.LineBasicMaterial;
          material.opacity = 0.3 + Math.sin(clock.elapsedTime * 2 + i) * 0.2;
        }
      });
    }
  });

  return (
    <group>
      <group ref={nodesRef}>
        {nodesByType.map(([type, nodes]) => (
          <group key={type}>
            {nodes.map((node) => (
              <mesh
                key={node.id}
                position={[node.x, node.y, node.z]}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  onHover(node);
                  gl.domElement.style.cursor = "pointer";
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  handlePointerOut();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClick(node);
                }}
              >
                <sphereGeometry args={[node.size, 32, 32]} />
                <meshBasicMaterial
                  color={node.color}
                  toneMapped={false}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      <group ref={edgesRef}>
        {graph.edges.map((edge, i) => {
          const fromNode = graph.nodes.find((n) => n.id === edge.from);
          const toNode = graph.nodes.find((n) => n.id === edge.to);
          
          if (!fromNode || !toNode) return null;

          const points = [
            new THREE.Vector3(fromNode.x, fromNode.y, fromNode.z),
            new THREE.Vector3(toNode.x, toNode.y, toNode.z),
          ];
          
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          
          return (
            <line key={`${edge.from}-${edge.to}-${i}`} geometry={geometry}>
              <lineBasicMaterial
                color={edge.color}
                transparent
                opacity={edge.active ? 0.5 : 0.2}
                linewidth={2}
              />
            </line>
          );
        })}
      </group>

      {graph.nodes.map((node) => (
        <pointLight
          key={`light-${node.id}`}
          position={[node.x, node.y, node.z]}
          color={node.glow}
          intensity={node.size * 2}
          distance={node.size * 10}
        />
      ))}
    </group>
  );
}
