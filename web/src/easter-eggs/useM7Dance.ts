"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import {
  DANCE,
  TAP_COUNT,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  TAP_WINDOW_MS,
} from "./config";
import {
  isDancePending,
  markDanceFinished,
  markDanceStarted,
  requestDance,
} from "./danceBus";

interface Options {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  animations: THREE.AnimationClip[];
  scene: THREE.Object3D;
  /** HeroCharacter's phase; a dance only starts once this reads "idle". */
  phase: RefObject<string>;
  /** Model height in the wrapper's units — the feet sit at -height / 2. */
  height: number;
}

/**
 * m_7's secret move. Reuses HeroCharacter's existing AnimationMixer and the
 * "Dance" clip already embedded in m_7.glb (no extra file). Requests come
 * from the dance bus (Konami code, or the toast link on another page) or
 * from five quick taps on the character on touch devices.
 *
 * Returns:
 *  - `inPlace`: ref for an identity group wrapping the model,
 *  - `lockInPlace`: call right after mixer.update(),
 *  - `armWeight` (1 → 0 → 1): how strongly HeroCharacter's relaxed-arm idle
 *    override should apply — it fades out with the Idle → Dance crossfade so
 *    the dance's own arm motion plays, and back in on the return to Idle.
 */
export function useM7Dance({ mixer, idle, animations, scene, phase, height }: Options) {
  const get = useThree((s) => s.get);
  const armWeight = useRef(1);
  /** Attach to an identity group wrapping the model; nudged to keep him in place. */
  const inPlace = useRef<THREE.Group>(null);

  // The clip with root translation stripped, so he dances exactly in place
  // at his idle resting spot (never drifting toward the nav or headline).
  const dance = useMemo(() => {
    const source = animations.find((a) => a.name === DANCE.clipName);
    if (!source) return null;
    const clip = source.clone();
    clip.tracks = clip.tracks.filter((track) => {
      const [node, prop] = [
        track.name.slice(0, track.name.lastIndexOf(".")),
        track.name.slice(track.name.lastIndexOf(".") + 1),
      ];
      return !(prop === "position" && (DANCE.lockedRootBones as readonly string[]).includes(node));
    });
    const action = mixer.clipAction(clip);
    action.clampWhenFinished = true; // hold the last pose if a frame stalls past the end
    return action;
  }, [animations, mixer]);

  const state = useRef<"off" | "in" | "dancing" | "out">("off");

  // In-place lock: the hips' scene-local X/Z at the moment the dance starts.
  const anchor = useMemo(() => scene.getObjectByName(DANCE.anchorBone) ?? null, [scene]);
  const lock = useRef<THREE.Vector3 | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const anchorLocal = (out: THREE.Vector3) => {
    anchor!.updateWorldMatrix(true, false);
    return scene.worldToLocal(anchor!.getWorldPosition(out));
  };

  /**
   * Call right after mixer.update(): offsets the model so the hips stay on
   * their Idle X/Z for the whole dance (and through both crossfades), and
   * applies the feet-pivoted dance scale.
   */
  const lockInPlace = () => {
    const start = lock.current;
    const wrap = inPlace.current;
    if (!start || !anchor || !wrap) return;
    const p = anchorLocal(tmp);
    // shrink tracks the crossfades: 0 in Idle, 1 while fully dancing
    const k = 1 - armWeight.current;
    const s = 1 - (1 - DANCE.scale) * k;
    wrap.scale.setScalar(s);
    wrap.position.set(
      -(p.x - start.x) * scene.scale.x * s,
      -(height / 2) * (1 - s), // keep the feet planted while scaled
      -(p.z - start.z) * scene.scale.z * s
    );
  };

  const elapsed = useRef(0);
  const idleSince = useRef<number | null>(null); // wall-clock ms
  const playFor = useRef(0);

  useFrame((_, delta) => {
    if (!dance || !idle) return;
    const dt = Math.min(delta, 0.05);
    const fade = DANCE.crossfade;

    if (state.current === "off") {
      const now = performance.now();
      if (phase.current !== "idle") idleSince.current = null;
      else if (idleSince.current === null) idleSince.current = now;
      if (!isDancePending() || idleSince.current === null) return;
      // a request queued before he was idle (walk-in, model load, arriving
      // from another page) waits a beat after reaching Idle
      if (now - idleSince.current < DANCE.queuedStartDelayMs) return;

      if (anchor) {
        lock.current = anchorLocal(new THREE.Vector3());
      }
      const loops = prefersReducedMotion() ? DANCE.loopsReducedMotion : DANCE.loops;
      playFor.current = dance.getClip().duration * loops;
      dance.reset();
      dance.setLoop(THREE.LoopRepeat, loops);
      dance.play();
      idle.crossFadeTo(dance, fade, false);
      elapsed.current = 0;
      state.current = "in";
      markDanceStarted();
      return;
    }

    elapsed.current += dt;

    if (state.current === "in") {
      armWeight.current = Math.max(0, 1 - elapsed.current / fade);
      if (elapsed.current >= fade) state.current = "dancing";
    } else if (state.current === "dancing") {
      if (elapsed.current >= playFor.current - fade) {
        idle.reset().play();
        dance.crossFadeTo(idle, fade, false);
        elapsed.current = 0;
        state.current = "out";
      }
    } else if (state.current === "out") {
      armWeight.current = Math.min(1, elapsed.current / fade);
      if (elapsed.current >= fade) {
        dance.stop();
        inPlace.current?.position.set(0, 0, 0);
        inPlace.current?.scale.setScalar(1);
        lock.current = null;
        armWeight.current = 1;
        idleSince.current = performance.now();
        state.current = "off";
        markDanceFinished(); // can be triggered again from here on
      }
    }
  });

  // Leaving the page mid-dance: release the bus so it can be retriggered.
  useEffect(() => {
    return () => {
      if (state.current !== "off") {
        dance?.stop();
        markDanceFinished();
      }
    };
  }, [dance]);

  // Touch alternative: five quick taps on m_7 himself. The character layer
  // is pointer-events: none, so listen passively on window (never blocking
  // scroll) and hit-test only genuine taps — short, nearly motionless
  // touches. The hit test projects m_7's deform skeleton to screen and
  // checks the tap against a capsule around each limb segment (plus a
  // larger circle for the head): a few dozen 2D distance checks instead of
  // a full skinned-mesh raycast (~30k vertices, ~100ms on a phone).
  useEffect(() => {
    if (!dance) return;
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

    // world point → canvas pixel coords
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
      // on-screen body height sets the capsule radius
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
  }, [dance, get, scene]);

  return { armWeight, lockInPlace, inPlace };
}
