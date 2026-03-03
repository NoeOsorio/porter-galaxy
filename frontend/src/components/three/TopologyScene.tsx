import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TopologyNode, TopologyGraph, TopologyEdge } from "../../types/topology";

interface TopologySceneProps {
  graph: TopologyGraph;
  onHover: (node: TopologyNode | null) => void;
  onClick: (node: TopologyNode | null) => void;
  selectedNode: TopologyNode | null;
}

interface FlowParticle {
  position: THREE.Vector3;
  progress: number;
  edgeIndex: number;
}

function findPathToNode(
  targetNodeId: string,
  graph: TopologyGraph
): TopologyEdge[] {
  const path: TopologyEdge[] = [];
  const visited = new Set<string>();
  
  function dfs(currentId: string): boolean {
    if (currentId === targetNodeId) {
      return true;
    }
    
    visited.add(currentId);
    
    const outgoingEdges = graph.edges.filter(edge => edge.from === currentId);
    
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.to)) {
        path.push(edge);
        if (dfs(edge.to)) {
          return true;
        }
        path.pop();
      }
    }
    
    return false;
  }
  
  const internetNode = graph.nodes.find(n => n.type === "internet");
  if (internetNode) {
    dfs(internetNode.id);
  }
  
  return path;
}

export default function TopologyScene({
  graph,
  onHover,
  onClick,
  selectedNode,
}: TopologySceneProps) {
  const { gl } = useThree();
  const nodesRef = useRef<THREE.Group>(null);
  const edgesRef = useRef<THREE.Group>(null);
  const flowParticlesRef = useRef<FlowParticle[]>([]);
  const [flowPath, setFlowPath] = useState<TopologyEdge[]>([]);

  useEffect(() => {
    if (selectedNode) {
      const path = findPathToNode(selectedNode.id, graph);
      setFlowPath(path);
      
      if (path.length > 0) {
        const particles: FlowParticle[] = [];
        const firstEdge = path[0]!;
        const startNode = graph.nodes.find(n => n.id === firstEdge.from);
        
        for (let i = 0; i < 5; i++) {
          particles.push({
            position: startNode 
              ? new THREE.Vector3(startNode.x, startNode.y, startNode.z)
              : new THREE.Vector3(),
            progress: i / 5,
            edgeIndex: 0,
          });
        }
        flowParticlesRef.current = particles;
      } else {
        flowParticlesRef.current = [];
      }
    } else {
      setFlowPath([]);
      flowParticlesRef.current = [];
    }
  }, [selectedNode, graph]);

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

  const nodesInPath = useMemo(() => {
    const nodeIds = new Set<string>();
    flowPath.forEach(edge => {
      nodeIds.add(edge.from);
      nodeIds.add(edge.to);
    });
    return nodeIds;
  }, [flowPath]);

  useFrame(({ clock }, delta) => {
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

    if (flowParticlesRef.current.length > 0 && flowPath.length > 0) {
      flowParticlesRef.current.forEach((particle) => {
        particle.progress += delta * 0.8;
        
        if (particle.progress >= flowPath.length) {
          particle.progress = 0;
          particle.edgeIndex = 0;
        }
        
        const currentEdgeIndex = Math.floor(particle.progress);
        const edgeProgress = particle.progress - currentEdgeIndex;
        
        if (currentEdgeIndex < flowPath.length) {
          const edge = flowPath[currentEdgeIndex]!;
          const fromNode = graph.nodes.find(n => n.id === edge.from);
          const toNode = graph.nodes.find(n => n.id === edge.to);
          
          if (fromNode && toNode) {
            particle.position.set(
              THREE.MathUtils.lerp(fromNode.x, toNode.x, edgeProgress),
              THREE.MathUtils.lerp(fromNode.y, toNode.y, edgeProgress),
              THREE.MathUtils.lerp(fromNode.z, toNode.z, edgeProgress)
            );
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
        <planeGeometry args={[3000, 3000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <group ref={nodesRef}>
        {nodesByType.map(([type, nodes]) => (
          <group key={type}>
            {nodes.map((node) => {
              const isInPath = nodesInPath.has(node.id);
              const glowColor = isInPath ? "#00d4ff" : node.glow;
              const glowOpacity = isInPath ? 0.4 : 0.15;
              
              return (
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
                      color={glowColor}
                      transparent
                      opacity={glowOpacity}
                      toneMapped={false}
                    />
                  </mesh>
                  {isInPath && (
                    <mesh>
                      <sphereGeometry args={[node.size * 1.6, 32, 32]} />
                      <meshBasicMaterial
                        color="#00d4ff"
                        transparent
                        opacity={0.15}
                        toneMapped={false}
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

      {graph.nodes.map((node) => {
        const isInPath = nodesInPath.has(node.id);
        const lightColor = isInPath ? "#00d4ff" : node.glow;
        const lightIntensity = isInPath ? node.size * 3 : node.size * 2;
        
        return (
          <pointLight
            key={`light-${node.id}`}
            position={[node.x, node.y, node.z]}
            color={lightColor}
            intensity={lightIntensity}
            distance={node.size * 10}
          />
        );
      })}

      {flowPath.length > 0 && flowParticlesRef.current.map((particle, i) => (
        <group key={`particle-${i}`} position={particle.position}>
          <mesh>
            <sphereGeometry args={[6, 16, 16]} />
            <meshBasicMaterial
              color="#ffffff"
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[10, 16, 16]} />
            <meshBasicMaterial
              color="#00d4ff"
              transparent
              opacity={0.6}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[14, 16, 16]} />
            <meshBasicMaterial
              color="#00d4ff"
              transparent
              opacity={0.3}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            color="#00d4ff"
            intensity={100}
            distance={50}
          />
        </group>
      ))}

      {flowPath.length > 0 && flowPath.map((edge, i) => {
        const fromNode = graph.nodes.find(n => n.id === edge.from);
        const toNode = graph.nodes.find(n => n.id === edge.to);
        
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
            key={`flow-edge-${edge.from}-${edge.to}-${i}`}
            position={midpoint}
            quaternion={quaternion}
          >
            <cylinderGeometry args={[1.2, 1.2, length, 8]} />
            <meshBasicMaterial
              color="#00d4ff"
              transparent
              opacity={0.6}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
