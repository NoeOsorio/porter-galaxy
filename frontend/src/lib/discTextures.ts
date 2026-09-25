import * as THREE from "three";

// Nodes are camera-facing sprites instead of spheres: a sphere near the edge of
// a 60° perspective view projects to an ellipse, a sprite always to a circle.

let solid: THREE.Texture | null = null;
let glow: THREE.Texture | null = null;

function paint(draw: (ctx: CanvasRenderingContext2D, r: number) => void): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function solidDiscTexture(): THREE.Texture {
  solid ??= paint((ctx, r) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fill();
  });
  return solid;
}

export function glowDiscTexture(): THREE.Texture {
  glow ??= paint((ctx, r) => {
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.6)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, r * 2, r * 2);
  });
  return glow;
}

export function setCursor(cursor: "pointer" | "default") {
  document.body.style.cursor = cursor;
}
