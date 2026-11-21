"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { M7StateMachine } from "@/m7";
import { TAP_COUNT, TAP_MAX_DURATION_MS, TAP_MAX_MOVE_PX, TAP_WINDOW_MS } from "./config";
import { isDancePending, markDanceFinished, markDanceStarted, requestDance } from "./danceBus";

/**
 * Connects the hidden triggers to m_7's state machine:
 *  - a pending request on the dance bus (Konami code here, or the toast link
 *    on another page) becomes a DANCE request — the machine queues it
 *    behind the walk-in or a fresh return to Idle, and lets it override
 *    BORED;
 *  - the bus hears when DANCE actually starts / ends (toast + re-arming);
 *  - five quick taps on m_7 himself (touch) request a dance too.
 */
export function useDanceTriggers(machine: M7StateMachine, scene: THREE.Object3D) {
  const get = useThree((s) => s.get);

  useFrame(() => {
    if (isDancePending() && machine.getState() !== "DANCE" && !machine.isQueued("DANCE")) {
      machine.request("DANCE");
    }
  });

  useEffect(() => {
    const stop = machine.onChange((next, prev) => {
      if (next === "DANCE") markDanceStarted();
      else if (prev === "DANCE") markDanceFinished();
    });
    return () => {
      stop();
      if (machine.getState() === "DANCE") markDanceFinished();
    };
  }, [machine]);

  // Touch alternative: five quick taps on m_7 himself. The character layer
  // is pointer-events: none, so listen passively on window (never blocking
  // scroll) and hit-test only genuine taps — short, nearly motionless
  // touches. The hit test projects m_7's deform skeleton to screen and
  // checks the tap against a capsule around each limb segment (plus a
  // larger circle for the head): a few dozen 2D distance checks instead of
  // a full skinned-mesh raycast (~30k vertices, ~100ms on a phone).
  useEffect(() => {
    if (!machine.has("DANCE")) return;
    const bones: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.name.startsWith("DEF-")) bones.push(o);
    });
    const segments = bones
      .filter((bone) => bone.parent && bone.parent.name.startsWith("DEF-"))
      .map((bone) => [bone.parent!, bone] as const);
    const taps: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let down: { x: number; y: number; t: number; id: number } | null = null;

    const toScreen = (obj: THREE.Object3D, out: THREE.Vector3, rect: DOMRect) => {
      obj.getWorldPosition(out).project(get().camera);
      out.set(((out.x + 1) / 2) * rect.width, ((1 - out.y) / 2) * rect.height, 0);
      return out;
    };
    const distToSegment = (px: number, py: number, p: THREE.Vector3, q: THREE.Vector3) => {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? THREE.MathUtils.clamp(((px - p.x) * dx + (py - p.y) * dy) / len2, 0, 1) : 0;
      return Math.hypot(px - (p.x + t * dx), py - (p.y + t * dy));
    };

    const hitsM7 = (clientX: number, clientY: number) => {
      if (!bones.length) return false;
      const rect = get().gl.domElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return false;

      scene.updateWorldMatrix(true, true);
      let top = Infinity;
      let bottom = -Infinity;
      let head: THREE.Vector3 | null = null;
      for (const bone of bones) {
        const s = toScreen(bone, a, rect);
        if (s.y < top) {
          top = s.y;
          head = b.copy(s);
        }
        bottom = Math.max(bottom, s.y);
      }
      const height = bottom - top;
      if (head && Math.hypot(x - head.x, y - head.y) < height * 0.17) return true;
      const radius = height * 0.08;
      for (const [parent, bone] of segments) {
        const p = toScreen(parent, a, rect).clone();
        const q = toScreen(bone, b, rect);
        if (distToSegment(x, y, p, q) < radius) return true;
      }
      return false;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || e.pointerId !== start.id) return;
      if (e.timeStamp - start.t > TAP_MAX_DURATION_MS) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MAX_MOVE_PX) return;
      if (!hitsM7(e.clientX, e.clientY)) return;

      taps.push(e.timeStamp);
      while (taps.length && e.timeStamp - taps[0] > TAP_WINDOW_MS) taps.shift();
      if (taps.length >= TAP_COUNT) {
        taps.length = 0;
        requestDance();
      }
    };
    const onCancel = () => {
      down = null; // the browser took the touch for scrolling
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [machine, get, scene]);
}
