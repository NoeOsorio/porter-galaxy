import * as THREE from "three";

let solid: THREE.Texture | null = null;

/** White filled circle, shared by the Topology flow particles. */
export function solidDiscTexture(): THREE.Texture {
  if (!solid) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    solid = new THREE.CanvasTexture(canvas);
    solid.colorSpace = THREE.SRGBColorSpace;
  }
  return solid;
}
