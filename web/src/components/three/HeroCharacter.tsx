"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";

const ACCENT = "#2997FF";
const MODEL = "/m_7.glb";
const TARGET_HEIGHT = 2.15; // world units the character is scaled to fill
const WALK_SPEED_LOCAL = 0.72; // root units/sec from the "Walk (RM)" clip
const FACING_WALK = Math.PI / 2; // side profile, walking toward +X (screen right)

// Authored A-pose (== bind pose) arm rotations — the natural "relaxed arms"
// reference we ease toward in idle, since the Idle clip holds the arms raised.
const REST_ARMS: Record<string, [number, number, number, number]> = {
  "DEF-upper_arm.L": [-0.0409, 0.8091, -0.5025, 0.302],
  "DEF-upper_arm.R": [-0.0409, -0.8091, 0.5025, 0.302],
  "DEF-forearm.L": [0.1377, 0, 0, 0.9905],
  "DEF-forearm.R": [0.1377, 0, 0, 0.9905],
};

type Phase = "walk" | "settle" | "idle";

const restingX = (viewportWidth: number, isMobile: boolean) =>
  isMobile ? 0 : Math.min(viewportWidth * 0.22, 1.7);

/**
 * The hero mascot: the rigged m_7 GLB. On load it walks in from off-screen
 * left in side profile using the real "Walk" cycle, arrives at its resting
 * spot, turns to face the camera, and crossfades into "Idle". In idle the
 * arm bones are eased to the A-pose so they hang naturally (the authored
 * Idle loop holds them raised).
 */
export default function HeroCharacter() {
  const root = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL);
  const get = useThree((s) => s.get);

  // One mixer, driven manually so the arm override runs after mixer.update.
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const walk = useMemo(() => {
    const c = animations.find((a) => a.name === "Walk");
    return c ? mixer.clipAction(c) : null;
  }, [animations, mixer]);
  const idle = useMemo(() => {
    const c = animations.find((a) => a.name === "Idle");
    return c ? mixer.clipAction(c) : null;
  }, [animations, mixer]);

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    return { scale, center };
  }, [scene]);

  const phase = useRef<Phase>("walk");
  const ready = useRef(false);
  const needStart = useRef(false);

  // Arm bones + their relaxed target quaternions, resolved once.
  const armTargets = useMemo(() => {
    return Object.entries(REST_ARMS)
      .map(([name, q]) => {
        const bone = scene.getObjectByName(name);
        return bone ? { bone, target: new THREE.Quaternion(q[0], q[1], q[2], q[3]) } : null;
      })
      .filter((x): x is { bone: THREE.Object3D; target: THREE.Quaternion } => x !== null);
  }, [scene]);

  // Place the character and kick off the entrance once (not on resize).
  useEffect(() => {
    const g = root.current;
    if (!g || !idle) return;
    const { viewport, size } = get();
    const isMobile = size.width < 860;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || !walk) {
      g.position.x = restingX(viewport.width, isMobile);
      g.rotation.y = 0;
      idle.reset().play();
      phase.current = "idle";
      g.visible = true;
    } else {
      // Defer the off-screen placement to the first frame so it uses the
      // measured viewport, and stay hidden until then to avoid a flash.
      walk.reset().play();
      phase.current = "walk";
      needStart.current = true;
    }
    ready.current = true;

    return () => {
      walk?.stop();
      idle.stop();
    };
  }, [walk, idle, get]);

  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const sway = useMemo(() => new THREE.Quaternion(), []);
  const swayAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // guard against a large first-frame stall
    mixer.update(dt);
    const g = root.current;
    if (!g || !ready.current) return;

    const isMobile = state.size.width < 860;
    const targetX = restingX(state.viewport.width, isMobile);
    const worldSpeed = WALK_SPEED_LOCAL * fit.scale;

    // On stacked (mobile/tablet) layouts, shrink and drop the character into
    // the lower half so he sits below the headline rather than over it.
    g.scale.setScalar(isMobile ? 0.66 : 1);
    g.position.y = isMobile ? -0.4 : 0;

    // First ready frame: place off-screen left with the measured viewport.
    if (needStart.current) {
      g.position.x = -(state.viewport.width * 0.5 + 0.6); // just off the left edge
      g.rotation.y = FACING_WALK;
      g.visible = true;
      needStart.current = false;
      return;
    }

    if (phase.current === "walk") {
      g.position.x += worldSpeed * dt;
      if (g.position.x >= targetX) {
        g.position.x = targetX;
        if (idle) {
          idle.reset().play();
          walk?.crossFadeTo(idle, 0.45, false);
        }
        phase.current = "settle";
      }
    } else if (phase.current === "settle") {
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, 0, 0.12);
      g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, 0.1);
      if (Math.abs(g.rotation.y) < 0.01) {
        g.rotation.y = 0;
        phase.current = "idle";
      }
    }

    // Idle/settle: ease arms toward the relaxed A-pose (with a subtle sway),
    // applied after the clip so it overrides the raised authored pose.
    if (phase.current !== "walk") {
      const t = state.clock.elapsedTime;
      armTargets.forEach(({ bone, target }, i) => {
        sway.setFromAxisAngle(swayAxis, Math.sin(t * 0.8 + i) * 0.025);
        tmpQ.copy(target).multiply(sway);
        bone.quaternion.slerp(tmpQ, 0.2);
      });
    }
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={1.1} />
      <group ref={root} visible={false}>
        <primitive
          object={scene}
          scale={fit.scale}
          position={[
            -fit.center.x * fit.scale,
            -fit.center.y * fit.scale,
            -fit.center.z * fit.scale,
          ]}
        />
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
