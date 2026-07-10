"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Shared fit-to-frustum discipline (originated on EchoModel, now used by
// every showcase model): a model is never clipped by its canvas, whatever
// the stage aspect. The clamp shrinks PRESENTATION scale only — animation
// paths, physics and scroll scrub run in unscaled world units.
const EDGE_MARGIN = 0.06; // world units kept clear of the canvas edge
const MIN_FIT = 0.45; // never shrink into a thumbnail

/**
 * Worst-case projected half-extents (world units, camera-facing plane) of a
 * model under its presentation transforms. `sizeWorld` is the model's
 * bounding-box size in its own measured (GLB) frame, already scaled to world
 * units and expanded to cover any animated offsets (exploded lifts, side
 * parks). `rotations(yaw)` returns the wrapper rotation chain outermost
 * first — static tilt, scroll yaw, then any model-specific uprighting
 * rotations — matching the JSX group nesting. Sampling the scroll-scrub yaw
 * extremes (plus rest) covers the full range of motion, since the scrub is a
 * lerp between them.
 */
export function worstCaseHalfExtents(
  sizeWorld: THREE.Vector3,
  rotations: (yaw: number) => THREE.Euler[],
  yawsDeg: number[]
): { w: number; h: number } {
  const m = new THREE.Matrix4();
  const r = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let w = 0;
  let h = 0;
  for (const deg of yawsDeg) {
    m.identity();
    for (const e of rotations(THREE.MathUtils.degToRad(deg))) {
      m.multiply(r.makeRotationFromEuler(e));
    }
    for (let i = 0; i < 8; i++) {
      v.set(
        (i & 1 ? 0.5 : -0.5) * sizeWorld.x,
        (i & 2 ? 0.5 : -0.5) * sizeWorld.y,
        (i & 4 ? 0.5 : -0.5) * sizeWorld.z
      ).applyMatrix4(m);
      w = Math.max(w, Math.abs(v.x));
      h = Math.max(h, Math.abs(v.y));
    }
  }
  return { w, h };
}

/**
 * Live fit-to-frustum clamp: attach the returned ref to a group wrapping the
 * model's scaled geometry (INSIDE any entrance-travel groups, so flight/drive
 * paths stay in true world units). Every frame the group's scale eases toward
 * the largest value that keeps the given worst-case half-extents inside the
 * canvas frustum, so nothing is ever cut by the canvas edge at any stage
 * aspect — and it recovers to full size when space allows.
 */
export function useFitClamp(halfW: number, halfH: number) {
  const ref = useRef<THREE.Group>(null);
  const fit = useRef(1);
  useFrame((state) => {
    if (!ref.current) return;
    const s = Math.min(
      1,
      (state.viewport.width / 2 - EDGE_MARGIN) / halfW,
      (state.viewport.height / 2 - EDGE_MARGIN) / halfH
    );
    fit.current = THREE.MathUtils.lerp(fit.current, Math.max(MIN_FIT, s), 0.15);
    ref.current.scale.setScalar(fit.current);
  });
  return ref;
}
