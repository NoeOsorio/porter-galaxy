import { useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type {
  ClusterGalaxyNode,
  ClusterGalaxyGraph,
} from "../../types/clusters";

interface ClustersSceneProps {
  graph: ClusterGalaxyGraph;
  onHover: (node: ClusterGalaxyNode | null) => void;
  onClick: (node: ClusterGalaxyNode | null) => void;
  selectedNode: ClusterGalaxyNode | null;
  onDoubleClick: (node: ClusterGalaxyNode) => void;
  filteredNodes: Set<string>;
}

export default function ClustersScene({
  graph,
  onHover,
  onClick,
  selectedNode,
  onDoubleClick,
  filteredNodes,
}: ClustersSceneProps) {
  const { gl } = useThree();
  const nodesRef = useRef<THREE.Group>(null);
  const edgesRef = useRef<THREE.Group>(null);

  const handlePointerOut = useCallback(() => {
    onHover(null);
    gl.domElement.style.cursor = "default";
  }, [onHover, gl]);

  const nodesByType = useMemo(() => {
    const grouped = new Map<string, ClusterGalaxyNode[]>();
    graph.nodes.forEach((node) => {
      const list = grouped.get(node.type) || [];
      list.push(node);
      grouped.set(node.type, list);
    });
    return Array.from(grouped.entries());
  }, [graph.nodes]);

  useFrame(({ clock }) => {
    if (edgesRef.current) {
      edgesRef.current.children.forEach((line) => {
        const material = (line as THREE.Line)
          .material as THREE.LineBasicMaterial;
        material.opacity = 0.15 + Math.sin(clock.elapsedTime * 2) * 0.08;
      });
    }

    if (nodesRef.current) {
      graph.nodes.forEach((node) => {
        if (node.type === "cluster") {
          const nodeGroup = nodesRef.current?.children.find(
            (child) => child.userData.nodeId === node.id
          );
          if (nodeGroup) {
            nodeGroup.rotation.y = clock.elapsedTime * 0.1;
          }
        }
      });
    }
  });

  return (
    <group>
      <mesh
        position={[0, 0, -500]}
        onClick={(e) => {
          e.stopPropagation();
          onClick(null);
        }}
      >
        <planeGeometry args={[5000, 5000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <group ref={nodesRef}>
        {nodesByType.map(([type, nodes]) => (
          <group key={type}>
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isFiltered =
                filteredNodes.size > 0 && !filteredNodes.has(node.id);
              const glowColor = isSelected ? "#ffffff" : node.glow;
              const glowOpacity = isSelected ? 0.5 : 0.2;
              const nodeOpacity = isFiltered ? 0.2 : 1;

              return (
                <group
                  key={node.id}
                  position={[node.x, node.y, node.z]}
                  userData={{ nodeId: node.id }}
                >
                  <mesh
                    frustumCulled={false}
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
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onDoubleClick(node);
                    }}
                  >
                    <sphereGeometry args={[node.size, 32, 32]} />
                    <meshBasicMaterial
                      color={node.color}
                      toneMapped={false}
                      transparent
                      opacity={nodeOpacity}
                      depthWrite={true}
                      depthTest={true}
                    />
                  </mesh>
                  <mesh frustumCulled={false}>
                    <sphereGeometry args={[node.size * 1.4, 32, 32]} />
                    <meshBasicMaterial
                      color={glowColor}
                      transparent
                      opacity={glowOpacity * nodeOpacity}
                      toneMapped={false}
                      depthWrite={false}
                      depthTest={true}
                    />
                  </mesh>
                  {isSelected && (
                    <mesh frustumCulled={false}>
                      <sphereGeometry args={[node.size * 1.8, 32, 32]} />
                      <meshBasicMaterial
                        color="#ffffff"
                        transparent
                        opacity={0.15 * nodeOpacity}
                        toneMapped={false}
                        depthWrite={false}
                        depthTest={true}
                      />
                    </mesh>
                  )}
                </group>
              );
            })}
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
            direction.normalize()
          );

          const lineWidth = edge.type === "cluster-node" ? 1.5 : edge.type === "node-deployment" ? 1.0 : 0.6;

          return (
            <mesh
              key={`${edge.from}-${edge.to}-${i}`}
              position={midpoint}
              quaternion={quaternion}
              frustumCulled={false}
            >
              <cylinderGeometry args={[lineWidth, lineWidth, length, 8]} />
              <meshBasicMaterial
                color={edge.color}
                transparent
                opacity={0.25}
                toneMapped={false}
                depthWrite={false}
                depthTest={true}
              />
            </mesh>
          );
        })}
      </group>

      {graph.nodes.map((node) => {
        const isSelected = selectedNode?.id === node.id;
        const lightColor = isSelected ? "#ffffff" : node.glow;
        const lightIntensity = isSelected
          ? node.size * 4
          : node.type === "cluster"
            ? node.size * 3
            : node.size * 2;

        return (
          <pointLight
            key={`light-${node.id}`}
            position={[node.x, node.y, node.z]}
            color={lightColor}
            intensity={lightIntensity}
            distance={node.size * 12}
          />
        );
      })}
    </group>
  );
}
