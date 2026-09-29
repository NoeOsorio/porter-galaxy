import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { LayoutStore } from "../../lib/layout/layoutStore";

export interface NodeAttributes {
  /** Keys in draw order; must match the arrays below. */
  keys: string[];
  /** Linear RGB, 3 floats per node. */
  colors: Float32Array;
  glowColors: Float32Array;
  radii: Float32Array;
  opacities: Float32Array;
  /** 1 for nodes that blink (failed pods), else 0. */
  blink: Float32Array;
  /** 1 for nodes that pulse in size (recently restarted pods), else 0. */
  pulse: Float32Array;
}

// Billboards are expanded in view space so every node faces the camera and
// projects to a circle regardless of where it sits in a wide-FOV view.
const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec3 aColor;
  attribute float aRadius;
  attribute float aOpacity;
  attribute float aBlink;
  attribute float aPulse;
  uniform float uTime;
  uniform float uScale;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    float pulse = 1.0 + aPulse * 0.35 * (0.5 + 0.5 * sin(uTime * 3.0));
    mv.xy += position.xy * aRadius * 2.0 * uScale * pulse;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vColor = aColor;
    float blink = aBlink > 0.5 ? 0.4 + 0.6 * sin(uTime * 4.0) : 1.0;
    vAlpha = aOpacity * blink;
  }
`;

const bodyFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(1.0, 0.92, d));
    #include <colorspace_fragment>
  }
`;

const glowFragment = /* glsl */ `
  uniform float uGlow;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, vAlpha * uGlow * pow(1.0 - d, 1.6));
    #include <colorspace_fragment>
  }
`;

function makeGeometry(count: number) {
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.getAttribute("position"));
  geometry.setAttribute("uv", plane.getAttribute("uv"));
  geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
  geometry.instanceCount = count;
  return geometry;
}

interface Props {
  store: LayoutStore;
  attributes: NodeAttributes;
  glowScale: number;
  glowOpacity: number;
}

/** All nodes of a scene in two draw calls: halos, then bodies. */
export default function NodeInstances({ store, attributes, glowScale, glowOpacity }: Props) {
  const { keys } = attributes;
  const keySignature = keys.join("|");
  // Rebuilt only when the set of keys changes; state-only snapshots patch attributes below.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keySignature captures `keys` by value
  const geometry = useMemo(() => makeGeometry(keys.length), [keySignature]);
  const bodyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: bodyFragment,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
        transparent: true,
        toneMapped: false,
      }),
    [],
  );
  const glowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: glowFragment,
        uniforms: { uTime: { value: 0 }, uScale: { value: glowScale }, uGlow: { value: glowOpacity } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [glowScale, glowOpacity],
  );
  const synced = useRef<{ store: LayoutStore | null; version: number; keys: string[] | null }>({ store: null, version: -1, keys: null });

  useEffect(() => {
    geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(attributes.colors, 3));
    geometry.setAttribute("aRadius", new THREE.InstancedBufferAttribute(attributes.radii, 1));
    geometry.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(attributes.opacities, 1));
    geometry.setAttribute("aBlink", new THREE.InstancedBufferAttribute(attributes.blink, 1));
    geometry.setAttribute("aPulse", new THREE.InstancedBufferAttribute(attributes.pulse, 1));
  }, [geometry, attributes]);

  // The glow layer shares positions and radii but uses its own colors.
  const glowGeometry = useMemo(() => {
    const g = geometry.clone();
    g.instanceCount = geometry.instanceCount;
    return g;
  }, [geometry]);
  useEffect(() => {
    glowGeometry.setAttribute("aOffset", geometry.getAttribute("aOffset"));
    glowGeometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(attributes.glowColors, 3));
    glowGeometry.setAttribute("aRadius", new THREE.InstancedBufferAttribute(attributes.radii, 1));
    glowGeometry.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(attributes.opacities, 1));
    glowGeometry.setAttribute("aBlink", new THREE.InstancedBufferAttribute(attributes.blink, 1));
    glowGeometry.setAttribute("aPulse", new THREE.InstancedBufferAttribute(attributes.pulse, 1));
  }, [glowGeometry, geometry, attributes]);

  useEffect(
    () => () => {
      geometry.dispose();
      glowGeometry.dispose();
    },
    [geometry, glowGeometry],
  );

  useFrame(({ clock }) => {
    bodyMaterial.uniforms.uTime!.value = clock.elapsedTime;
    glowMaterial.uniforms.uTime!.value = clock.elapsedTime;

    const s = synced.current;
    if (s.store === store && s.version === store.version && s.keys === keys) return;
    s.store = store;
    s.version = store.version;
    s.keys = keys;

    const offsets = geometry.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    const out = offsets.array as Float32Array;
    const src = store.positions;
    for (let i = 0; i < keys.length; i++) {
      const j = store.index.get(keys[i]!);
      if (j === undefined) continue;
      out[i * 3] = src[j * 3]!;
      out[i * 3 + 1] = src[j * 3 + 1]!;
      out[i * 3 + 2] = src[j * 3 + 2]!;
    }
    offsets.needsUpdate = true;
  });

  return (
    <>
      <mesh geometry={glowGeometry} material={glowMaterial} frustumCulled={false} raycast={() => null} />
      <mesh geometry={geometry} material={bodyMaterial} frustumCulled={false} raycast={() => null} />
    </>
  );
}
