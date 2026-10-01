import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { readPosition, type LayoutStore } from "../lib/layout/layoutStore";

export type LabelStyle = "group" | "primary" | "secondary" | "detail";

export interface LabelCandidate {
  id: string;
  text: string;
  /**
   * Lower ranks are placed first and win collisions. Candidates with
   * `maxDistance` that are close enough jump ahead of every other non-group
   * label, so zooming in reveals detail instead of more far-away names.
   */
  rank: number;
  /** One key labels that node; several label their centroid (a namespace). */
  keys: string[];
  style: LabelStyle;
  /** Shown only when the camera is closer than this distance to the anchor. */
  maxDistance?: number;
  /** Radius of the anchored node, so the label sits just below it. */
  radius?: number;
  /** Namespace group key on `group` labels; clicking the label focuses it. */
  group?: string;
}

const MAX_LABELS = 60;
const projected = new THREE.Vector3();

const BASE_CLASS = "absolute left-0 top-0 whitespace-nowrap px-1 [text-shadow:0_0_4px_#05050f,0_0_8px_#05050f]";

const CLASS: Record<LabelStyle, string> = {
  group: "text-[11px] font-semibold tracking-[3px] uppercase text-white/80",
  primary: "text-[11px] text-white/90",
  secondary: "text-[10px] text-white/70",
  detail: "text-[9px] text-white/55",
};

interface Props {
  store: LayoutStore;
  candidates: LabelCandidate[];
  onGroupClick?: (group: string) => void;
}

/**
 * Screen-space labels with level of detail. Runs inside the Canvas and writes
 * a fixed pool of DOM elements directly each frame, so labels never trigger
 * React renders.
 */
export default function Labels({ store, candidates, onGroupClick }: Props) {
  const { gl, camera, size } = useThree();
  const ordered = useMemo(() => {
    const byRank = [...candidates].sort((a, b) => a.rank - b.rank);
    return [
      ...byRank.filter((c) => c.style === "group"),
      ...byRank.filter((c) => c.style !== "group" && c.maxDistance !== undefined),
      ...byRank.filter((c) => c.style !== "group" && c.maxDistance === undefined),
    ];
  }, [candidates]);

  const pool = useRef<HTMLDivElement[]>([]);
  // Label sizes measured once per (style, text); collision checks run every frame.
  const sizes = useRef(new Map<string, [number, number]>());
  const measurer = useRef<HTMLDivElement | null>(null);
  const onGroupClickRef = useRef(onGroupClick);
  useEffect(() => {
    onGroupClickRef.current = onGroupClick;
  }, [onGroupClick]);

  useEffect(() => {
    const container = document.createElement("div");
    container.className = "absolute inset-0 pointer-events-none overflow-hidden font-['JetBrains_Mono',monospace]";
    pool.current = Array.from({ length: MAX_LABELS }, () => {
      const el = document.createElement("div");
      el.style.display = "none";
      container.appendChild(el);
      return el;
    });
    const probe = document.createElement("div");
    probe.style.visibility = "hidden";
    container.appendChild(probe);
    measurer.current = probe;
    // Only group labels take pointer events; the click bubbles here.
    container.addEventListener("click", (e) => {
      const group = (e.target as HTMLElement).dataset.group;
      if (group) onGroupClickRef.current?.(group);
    });
    gl.domElement.parentElement?.appendChild(container);
    return () => {
      container.remove();
      pool.current = [];
      measurer.current = null;
    };
  }, [gl]);

  const measure = (c: LabelCandidate): [number, number] => {
    const id = `${c.style}|${c.text}`;
    let size = sizes.current.get(id);
    if (!size && measurer.current) {
      measurer.current.className = `${BASE_CLASS} ${CLASS[c.style]}`;
      measurer.current.textContent = c.text;
      size = [measurer.current.offsetWidth, measurer.current.offsetHeight];
      sizes.current.set(id, size);
    }
    return size ?? [c.text.length * 7, 14];
  };

  useFrame(() => {
    const items = pool.current;
    if (items.length === 0) return;
    const p = projected;
    const rects: number[] = [];
    const fov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 3;
    const pxPerUnit = size.height / 2 / Math.tan(fov / 2);
    let used = 0;

    for (const c of ordered) {
      if (used >= MAX_LABELS) break;
      const [w, h] = measure(c);
      let left: number;
      let top: number;
      if (c.keys.length === 1) {
        if (!readPosition(store, c.keys[0]!, p)) continue;
        const distance = p.distanceTo(camera.position);
        if (c.maxDistance !== undefined && distance > c.maxDistance) continue;
        p.project(camera);
        if (p.z < -1 || p.z > 1) continue;
        const below = c.radius ? (c.radius * pxPerUnit) / distance + 2 : -h / 2;
        left = ((p.x + 1) / 2) * size.width - w / 2;
        top = ((1 - p.y) / 2) * size.height + below;
      } else {
        // Group labels sit above the group's on-screen extent, leaving its
        // middle free for the labels of the workloads inside it.
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        for (const key of c.keys) {
          if (!readPosition(store, key, p)) continue;
          p.project(camera);
          if (p.z < -1 || p.z > 1) continue;
          const sx = ((p.x + 1) / 2) * size.width;
          const sy = ((1 - p.y) / 2) * size.height;
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
        }
        if (minY === Infinity) continue;
        left = (minX + maxX) / 2 - w / 2;
        top = minY - h - 6;
      }
      if (left + w < 0 || top + h < 0 || left > size.width || top > size.height) continue;

      let overlaps = false;
      for (let r = 0; r < rects.length; r += 4) {
        if (left < rects[r + 2]! && left + w > rects[r]! && top < rects[r + 3]! && top + h > rects[r + 1]!) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      rects.push(left, top, left + w, top + h);

      const el = items[used++]!;
      if (el.textContent !== c.text) el.textContent = c.text;
      if (el.dataset.style !== c.style) {
        el.dataset.style = c.style;
        el.className = `${BASE_CLASS} ${CLASS[c.style]}`;
      }
      const group = onGroupClickRef.current && c.group !== undefined ? c.group : "";
      if ((el.dataset.group ?? "") !== group) {
        el.dataset.group = group;
        el.style.pointerEvents = group ? "auto" : "none";
        el.style.cursor = group ? "pointer" : "";
      }
      el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      el.style.display = "block";
    }
    for (let i = used; i < MAX_LABELS; i++) {
      const el = items[i]!;
      if (el.style.display !== "none") el.style.display = "none";
    }
  });

  return null;
}
