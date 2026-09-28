import * as THREE from "three";

const scratch = new THREE.Color();

/** Writes a CSS color into `out` at slot `i` as linear RGB, scaled by `factor`. */
export function writeColor(out: Float32Array, i: number, css: string, factor = 1) {
  scratch.set(css);
  out[i * 3] = scratch.r * factor;
  out[i * 3 + 1] = scratch.g * factor;
  out[i * 3 + 2] = scratch.b * factor;
}
