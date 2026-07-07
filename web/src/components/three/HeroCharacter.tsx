"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";

const ACCENT = "#2997FF";
const MODEL = "/m_7.glb";
const TARGET_HEIGHT = 2.3; // world units the character is scaled to fill

/**
 * The hero mascot: the rigged m_7 GLB. On load it plays the built-in "Win"
 * greeting once, then crossfades into the looping "Idle" so it stays alive.
 * (This asset has no facial blend shapes or eye bones, so the original
 * wink isn't possible without re-authoring the model in Blender.)
 */
export default function HeroCharacter() {
  const group = useRef<THREE.Group>(null);
  const yaw = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL);
  const { actions, mixer } = useAnimations(animations, group);

  // Auto-fit: scale to a consistent height and recenter on the origin so the
  // framing is independent of the model's native units/pivot.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    return { scale, center };
  }, [scene]);

  useEffect(() => {
    const idle = actions["Idle"];
    const win = actions["Win"];
    if (!idle) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !win) {
      idle.reset().play();
      return;
    }

    // Greeting: Win dominates first (Idle silent underneath), then crossfade.
    idle.reset().play();
    idle.setEffectiveWeight(0);
    // clampWhenFinished holds the last Win frame so the crossfade to Idle
    // starts from the pose rather than snapping back to frame 0. Setting it
    // is three's intended AnimationAction API, hence the immutability opt-out.
    // eslint-disable-next-line react-hooks/immutability
    win.clampWhenFinished = true;
    win.reset().setLoop(THREE.LoopOnce, 1).play();

    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action === win) win.crossFadeTo(idle, 0.5, false);
    };
    mixer.addEventListener("finished", onFinished as never);
    return () => {
      mixer.removeEventListener("finished", onFinished as never);
      win?.stop();
      idle.stop();
    };
  }, [actions, mixer]);

  // Gentle yaw toward the cursor for a little life on top of the idle loop.
  useFrame((state) => {
    if (!yaw.current) return;
    const targetY = THREE.MathUtils.clamp(state.pointer.x, -1, 1) * 0.3;
    yaw.current.rotation.y = THREE.MathUtils.lerp(yaw.current.rotation.y, targetY, 0.05);
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={1.1} />
      <group ref={group}>
        <group ref={yaw}>
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
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
