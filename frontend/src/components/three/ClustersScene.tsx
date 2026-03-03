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
  errorPods: ClusterGalaxyNode[];
}

function findFamilyNodes(
  targetNodeId: string,
  graph: ClusterGalaxyGraph
): { nodes: Set<string>; edges: Set<string> } {
  const familyNodes = new Set<string>();
  const familyEdges = new Set<string>();
  
  familyNodes.add(targetNodeId);
  
  function findAncestors(nodeId: string) {
    const parentEdges = graph.edges.filter(edge => edge.to === nodeId);
    parentEdges.forEach(edge => {
      familyNodes.add(edge.from);
      familyEdges.add(`${edge.from}-${edge.to}`);
      findAncestors(edge.from);
    });
  }
  
  function findDescendants(nodeId: string) {
    const childEdges = graph.edges.filter(edge => edge.from === nodeId);
    childEdges.forEach(edge => {
      familyNodes.add(edge.to);
      familyEdges.add(`${edge.from}-${edge.to}`);
      findDescendants(edge.to);
    });
  }
  
  findAncestors(targetNodeId);
  findDescendants(targetNodeId);
  
  return { nodes: familyNodes, edges: familyEdges };
}

interface ErrorPodMeshProps {
  node: ClusterGalaxyNode;
  isErrorPod: boolean;
  nodeOpacity: number;
  onHover: (node: ClusterGalaxyNode | null) => void;
  onClick: (node: ClusterGalaxyNode | null) => void;
  onDoubleClick: (node: ClusterGalaxyNode) => void;
  gl: THREE.WebGLRenderer;
  handlePointerOut: () => void;
}

function ErrorPodMesh({
  node,
  isErrorPod,
  nodeOpacity,
  onHover,
  onClick,
  onDoubleClick,
  gl,
  handlePointerOut,
}: ErrorPodMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (isErrorPod && meshRef.current?.material) {
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      const blinkValue = 0.4 + Math.sin(clock.elapsedTime * 4) * 0.6;
      material.opacity = blinkValue * nodeOpacity;
    }
  });

  return (
    <mesh
      ref={meshRef}
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
  );
}

export default function ClustersScene({
  graph,
  onHover,
  onClick,
  selectedNode,
  onDoubleClick,
  filteredNodes,
  errorPods,
}: ClustersSceneProps) {
  const { gl } = useThree();
  const nodesRef = useRef<THREE.Group>(null);
  const edgesRef = useRef<THREE.Group>(null);

  const errorPodIds = useMemo(() => {
    return new Set(errorPods.map(pod => pod.id));
  }, [errorPods]);

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

  const familyPath = useMemo(() => {
    if (!selectedNode) return { nodes: new Set<string>(), edges: new Set<string>() };
    return findFamilyNodes(selectedNode.id, graph);
  }, [selectedNode, graph]);

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
      <group ref={nodesRef}>
        {nodesByType.map(([type, nodes]) => (
          <group key={type}>
            {nodes.map((node) => {
              const isInFamily = familyPath.nodes.has(node.id);
              const isFiltered =
                filteredNodes.size > 0 && !filteredNodes.has(node.id);
              const isErrorPod = errorPodIds.has(node.id);
              const glowColor = isInFamily ? "#00d4ff" : node.glow;
              const glowOpacity = isInFamily ? 0.5 : 0.2;
              const nodeOpacity = isFiltered ? 0.2 : (selectedNode && !isInFamily ? 0.3 : 1);

              return (
                <group
                  key={node.id}
                  position={[node.x, node.y, node.z]}
                  userData={{ nodeId: node.id }}
                >
                  <ErrorPodMesh
                    node={node}
                    isErrorPod={isErrorPod}
                    nodeOpacity={nodeOpacity}
                    onHover={onHover}
                    onClick={onClick}
                    onDoubleClick={onDoubleClick}
                    gl={gl}
                    handlePointerOut={handlePointerOut}
                  />
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
                  {isInFamily && (
                    <mesh frustumCulled={false}>
                      <sphereGeometry args={[node.size * 1.8, 32, 32]} />
                      <meshBasicMaterial
                        color="#00d4ff"
                        transparent
                        opacity={0.2 * nodeOpacity}
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

          const edgeKey = `${edge.from}-${edge.to}`;
          const isInFamily = familyPath.edges.has(edgeKey);

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

          const lineWidth = isInFamily 
            ? (edge.type === "cluster-node" ? 2.5 : edge.type === "node-deployment" ? 2.0 : 1.5)
            : (edge.type === "cluster-node" ? 1.5 : edge.type === "node-deployment" ? 1.0 : 0.6);
          const edgeOpacity = isInFamily ? 0.7 : (selectedNode ? 0.1 : 0.25);
          const edgeColor = isInFamily ? "#00d4ff" : edge.color;

          return (
            <mesh
              key={`${edge.from}-${edge.to}-${i}`}
              position={midpoint}
              quaternion={quaternion}
              frustumCulled={false}
            >
              <cylinderGeometry args={[lineWidth, lineWidth, length, 8]} />
              <meshBasicMaterial
                color={edgeColor}
                transparent
                opacity={edgeOpacity}
                toneMapped={false}
                depthWrite={false}
                depthTest={true}
              />
            </mesh>
          );
        })}
      </group>

      {graph.nodes.map((node) => {
        const isInFamily = familyPath.nodes.has(node.id);
        const lightColor = isInFamily ? "#00d4ff" : node.glow;
        const lightIntensity = isInFamily
          ? node.size * 5
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
