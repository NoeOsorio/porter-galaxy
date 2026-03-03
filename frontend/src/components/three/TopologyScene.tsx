import { useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TopologyNode, TopologyGraph } from "../../types/topology";

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
          const material = (line as THREE.Line)
            .material as THREE.LineBasicMaterial;
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
              <group key={node.id} position={[node.x, node.y, node.z]}>
                <mesh
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
                  <meshBasicMaterial color={node.color} toneMapped={false} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[node.size * 1.3, 32, 32]} />
                  <meshBasicMaterial
                    color={node.glow}
                    transparent
                    opacity={0.15}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            ))}
          </group>
        ))}
      </group>

      <group ref={edgesRef}>
        {graph.edges.map((edge, i) => {
          const fromNode = graph.nodes.find((n) => n.id === edge.from);
          const toNode = graph.nodes.find((n) => n.id === edge.to);

          if (!fromNode || !toNode) return null;

          const start = new THREE.Vector3(fromNode.x, fromNode.y, fromNode.z);
          const end = new THREE.Vector3(toNode.x, toNode.y, toNode.z);
          const direction = new THREE.Vector3().subVectors(end, start);
          const length = direction.length();
          const midpoint = new THREE.Vector3()
            .addVectors(start, end)
            .multiplyScalar(0.5);

          const quaternion = new THREE.Quaternion();
          quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize(),
          );

          return (
            <mesh
              key={`${edge.from}-${edge.to}-${i}`}
              position={midpoint}
              quaternion={quaternion}
            >
              <cylinderGeometry args={[0.5, 0.5, length, 8]} />
              <meshBasicMaterial
                color={edge.color}
                transparent
                opacity={edge.active ? 0.5 : 0.2}
                toneMapped={false}
              />
            </mesh>
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
