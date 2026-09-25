import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { glowDiscTexture, setCursor, solidDiscTexture } from "../../lib/discTextures";

interface NodeDiscProps<T> {
  node: T;
  radius: number;
  color: string;
  opacity: number;
  blink: boolean;
  onHover: (node: T | null) => void;
  onClick: (node: T) => void;
  onDoubleClick: (node: T) => void;
}

/** The clickable body of a node. Blinks when `blink` is set (failed pods). */
export function NodeDisc<T>({ node, radius, color, opacity, blink, onHover, onClick, onDoubleClick }: NodeDiscProps<T>) {
  const materialRef = useRef<THREE.SpriteMaterial>(null);

  useFrame(({ clock }) => {
    if (blink && materialRef.current) {
      materialRef.current.opacity = (0.4 + Math.sin(clock.elapsedTime * 4) * 0.6) * opacity;
    }
  });

  return (
    <sprite
      scale={[radius * 2, radius * 2, 1]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(node);
        setCursor("pointer");
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
        setCursor("default");
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
      <spriteMaterial
        ref={materialRef}
        map={solidDiscTexture()}
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        depthWrite
      />
    </sprite>
  );
}

interface GlowDiscProps {
  radius: number;
  color: string;
  opacity: number;
}

/** Soft halo drawn behind a node; ignores pointer events. */
export function GlowDisc({ radius, color, opacity }: GlowDiscProps) {
  return (
    <sprite scale={[radius * 2, radius * 2, 1]} raycast={() => null}>
      <spriteMaterial
        map={glowDiscTexture()}
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        depthWrite={false}
      />
    </sprite>
  );
}
