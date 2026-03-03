import {
  useRef,
  useEffect,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type {
  K8sMoleculeNode,
  K8sMoleculeClusterNode,
  K8sMoleculeDeploymentNode,
  K8sMoleculePodNode,
} from "../../types/k8sMolecule";
import { generateK8sMoleculeGraph, getAllNodesFlat } from "../../lib/k8sMoleculeGraph";
import { transformApiToMoleculeGraph } from "../../lib/transformApiToMolecule";
import type { ApiCluster } from "../../types/api";

interface ColorGroup {
  color: string;
  nodes: K8sMoleculeNode[];
  material: THREE.MeshBasicMaterial;
}

export interface K8sMoleculeSceneRef {
  resetPositions: () => void;
}

interface K8sMoleculeSceneProps {
  onHover: (node: K8sMoleculeNode | null) => void;
  onSelect: (node: K8sMoleculeNode | null) => void;
  nodeSpacing: number;
  clusterData?: ApiCluster;
}

const K8sMoleculeScene = forwardRef<K8sMoleculeSceneRef, K8sMoleculeSceneProps>(
  function K8sMoleculeScene({ onHover, onSelect, nodeSpacing, clusterData }, ref) {
    const graphRef = useRef(
      clusterData 
        ? transformApiToMoleculeGraph(clusterData)
        : generateK8sMoleculeGraph()
    );
    const flatNodesRef = useRef(getAllNodesFlat(graphRef.current));
    const groupsRef = useRef<ColorGroup[]>([]);
    const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
    const lineRef = useRef<THREE.LineSegments>(null);
    const matrix = useMemo(() => new THREE.Matrix4(), []);
    const { camera, gl, raycaster } = useThree();
    
    const [draggedNode, setDraggedNode] = useState<K8sMoleculeNode | null>(null);
    const [shiftPressed, setShiftPressed] = useState(false);
    const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
    const dragOffsetRef = useRef(new THREE.Vector3());
    const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);

    const buildGroups = useCallback(() => {
      const byColor = new Map<string, K8sMoleculeNode[]>();
      for (const n of flatNodesRef.current) {
        if (!byColor.has(n.color)) byColor.set(n.color, []);
        byColor.get(n.color)!.push(n);
      }
      
      const groups: ColorGroup[] = [];
      for (const [color, nodeList] of byColor) {
        groups.push({
          color,
          nodes: nodeList,
          material: new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            toneMapped: false,
          }),
        });
      }
      groupsRef.current = groups;
      meshRefs.current = new Array(groups.length).fill(null);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        resetPositions: () => {
          graphRef.current = clusterData 
            ? transformApiToMoleculeGraph(clusterData)
            : generateK8sMoleculeGraph();
          flatNodesRef.current = getAllNodesFlat(graphRef.current);
          buildGroups();
        },
      }),
      [clusterData, buildGroups]
    );

    useEffect(() => {
      if (clusterData) {
        graphRef.current = transformApiToMoleculeGraph(clusterData);
        flatNodesRef.current = getAllNodesFlat(graphRef.current);
        buildGroups();
      }
    }, [clusterData, buildGroups]);

    useEffect(() => {
      buildGroups();
    }, [buildGroups]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Shift") setShiftPressed(true);
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Shift") setShiftPressed(false);
      };
      
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);

    const getNodePosition = useCallback((node: K8sMoleculeNode): { x: number; y: number } => {
      if (node.kind === "Node") {
        const clusterNode = node as K8sMoleculeClusterNode;
        return { 
          x: clusterNode.userX ?? clusterNode.x, 
          y: clusterNode.userY ?? clusterNode.y 
        };
      }
      
      if (node.kind === "Deployment") {
        const deployNode = node as K8sMoleculeDeploymentNode;
        const parentNode = graphRef.current.nodes.find(n => n.id === deployNode.parentId);
        if (!parentNode) {
          return { 
            x: deployNode.userX ?? deployNode.x, 
            y: deployNode.userY ?? deployNode.y 
          };
        }
        
        const parentPos = getNodePosition(parentNode);
        const baseX = deployNode.userX ?? deployNode.x;
        const baseY = deployNode.userY ?? deployNode.y;
        const parentBaseX = parentNode.userX ?? parentNode.x;
        const parentBaseY = parentNode.userY ?? parentNode.y;
        
        const offsetX = baseX - parentBaseX;
        const offsetY = baseY - parentBaseY;
        
        return {
          x: parentPos.x + offsetX * nodeSpacing,
          y: parentPos.y + offsetY * nodeSpacing,
        };
      }
      
      if (node.kind === "Pod") {
        const podNode = node as K8sMoleculePodNode;
        const parentDeploy = flatNodesRef.current.find(
          n => n.id === podNode.parentId && n.kind === "Deployment"
        ) as K8sMoleculeDeploymentNode | undefined;
        
        if (!parentDeploy) {
          return { 
            x: podNode.userX ?? podNode.x, 
            y: podNode.userY ?? podNode.y 
          };
        }
        
        const parentPos = getNodePosition(parentDeploy);
        const baseX = podNode.userX ?? podNode.x;
        const baseY = podNode.userY ?? podNode.y;
        const parentBaseX = parentDeploy.userX ?? parentDeploy.x;
        const parentBaseY = parentDeploy.userY ?? parentDeploy.y;
        
        const offsetX = baseX - parentBaseX;
        const offsetY = baseY - parentBaseY;
        
        return {
          x: parentPos.x + offsetX * nodeSpacing,
          y: parentPos.y + offsetY * nodeSpacing,
        };
      }
      
      return { x: 0, y: 0 };
    }, [nodeSpacing]);

    const moveNode = useCallback((node: K8sMoleculeNode, newX: number, newY: number, dx: number, dy: number, moveChildrenOnly: boolean) => {
      if (!moveChildrenOnly) {
        node.userX = newX;
        node.userY = newY;
      }
      
      if (node.kind === "Node") {
        const clusterNode = node as K8sMoleculeClusterNode;
        for (const deploy of clusterNode.deployments) {
          const currentX = deploy.userX ?? deploy.x;
          const currentY = deploy.userY ?? deploy.y;
          deploy.userX = currentX + dx;
          deploy.userY = currentY + dy;
          
          for (const pod of deploy.pods) {
            const podCurrentX = pod.userX ?? pod.x;
            const podCurrentY = pod.userY ?? pod.y;
            pod.userX = podCurrentX + dx;
            pod.userY = podCurrentY + dy;
          }
        }
      } else if (node.kind === "Deployment") {
        const deployNode = node as K8sMoleculeDeploymentNode;
        for (const pod of deployNode.pods) {
          const podCurrentX = pod.userX ?? pod.x;
          const podCurrentY = pod.userY ?? pod.y;
          pod.userX = podCurrentX + dx;
          pod.userY = podCurrentY + dy;
        }
      }
    }, []);

    const handlePointerDown = useCallback((e: any, node: K8sMoleculeNode) => {
      e.stopPropagation();
      setDraggedNode(node);
      
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlaneRef.current, intersection);
      
      const currentPos = getNodePosition(node);
      
      dragOffsetRef.current.set(
        intersection.x - currentPos.x,
        intersection.y - currentPos.y,
        0
      );
      
      lastDragPosRef.current = { x: currentPos.x, y: currentPos.y };
      
      gl.domElement.style.cursor = "grabbing";
    }, [raycaster, gl, getNodePosition]);

    const handlePointerMove = useCallback((e: PointerEvent) => {
      if (!draggedNode || !lastDragPosRef.current) return;
      
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlaneRef.current, intersection);
      
      const newX = intersection.x - dragOffsetRef.current.x;
      const newY = intersection.y - dragOffsetRef.current.y;
      
      const dx = newX - lastDragPosRef.current.x;
      const dy = newY - lastDragPosRef.current.y;
      
      moveNode(draggedNode, newX, newY, dx, dy, shiftPressed);
      
      lastDragPosRef.current = { x: newX, y: newY };
    }, [draggedNode, shiftPressed, moveNode, raycaster, camera, gl]);

    const handlePointerUp = useCallback(() => {
      setDraggedNode(null);
      lastDragPosRef.current = null;
      gl.domElement.style.cursor = "default";
    }, [gl]);

    useEffect(() => {
      const canvas = gl.domElement;
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      
      return () => {
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
      };
    }, [handlePointerMove, handlePointerUp, gl]);

    const handlePointerOut = useCallback(() => onHover(null), [onHover]);

    useFrame(() => {
      const groups = groupsRef.current;
      
      for (let i = 0; i < groups.length; i++) {
        const mesh = meshRefs.current[i];
        const { nodes } = groups[i]!;
        if (!mesh || nodes.length === 0) continue;
        
        for (let j = 0; j < nodes.length; j++) {
          const node = nodes[j]!;
          const pos = getNodePosition(node);
          
          matrix.compose(
            new THREE.Vector3(pos.x, pos.y, 0),
            new THREE.Quaternion(),
            new THREE.Vector3(node.size, node.size, node.size)
          );
          mesh.setMatrixAt(j, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }

      const line = lineRef.current;
      if (line) {
        const positions: number[] = [];
        
        for (const clusterNode of graphRef.current.nodes) {
          if (clusterNode.kind !== "Node") continue;
          const nodePos = getNodePosition(clusterNode);
          
          for (const deploy of clusterNode.deployments) {
            const deployPos = getNodePosition(deploy);
            
            positions.push(nodePos.x, nodePos.y, 0);
            positions.push(deployPos.x, deployPos.y, 0);
            
            for (const pod of deploy.pods) {
              const podPos = getNodePosition(pod);
              
              positions.push(deployPos.x, deployPos.y, 0);
              positions.push(podPos.x, podPos.y, 0);
            }
          }
        }
        
        const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
        if (posAttr.array.length >= positions.length) {
          for (let i = 0; i < positions.length; i++) {
            posAttr.array[i] = positions[i]!;
          }
          posAttr.needsUpdate = true;
          line.geometry.setDrawRange(0, positions.length / 3);
        }
      }
    });

    const lineGeometry = useMemo(() => {
      const maxLines = 1000;
      const positions = new Float32Array(maxLines * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      return geo;
    }, []);

    const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

    const groups = groupsRef.current;

    return (
      <group>
        <lineSegments ref={lineRef} geometry={lineGeometry}>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </lineSegments>

        {groups.map((group, i) => {
          if (group.nodes.length === 0) return null;
          const nodes = group.nodes;
          return (
            <instancedMesh
              key={`${group.color}-${i}`}
              ref={(r) => {
                meshRefs.current[i] = r;
              }}
              args={[sphereGeo, group.material, nodes.length]}
              onPointerOver={(e) => {
                e.stopPropagation();
                const node = nodes[e.instanceId ?? 0];
                onHover(node ?? null);
                gl.domElement.style.cursor = "grab";
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                handlePointerOut();
                if (!draggedNode) {
                  gl.domElement.style.cursor = "default";
                }
              }}
              onPointerDown={(e) => {
                const node = nodes[e.instanceId ?? 0];
                if (node) handlePointerDown(e, node);
              }}
              onClick={(e) => {
                e.stopPropagation();
                const node = nodes[e.instanceId ?? 0];
                onSelect(node ?? null);
              }}
            />
          );
        })}
      </group>
    );
  }
);

export default K8sMoleculeScene;
