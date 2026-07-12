"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";
import { SIGNATURE } from "@/lib/palette";

const ACCENT = SIGNATURE; // signature copper rim light — the hero is chrome
const MODEL = "/m_7.glb";
const TARGET_HEIGHT = 2.15; // world units the base model is scaled to fill
const WALK_SPEED_LOCAL = 0.72; // root units/sec from the "Walk (RM)" clip
const FACING_WALK = Math.PI / 2; // side profile, walking toward +X (screen right)

// Presentation scale per layout. Desktop/tablet is 15% smaller than the base
// so the head clears the fixed nav; mobile keeps its own (smaller) size.
const DESKTOP_SCALE = 0.85;
const MOBILE_SCALE = 0.66;
const INTRO_KEY = "hx_intro_played"; // sessionStorage: walk-in plays once/session

// The jacket is baked into a shared palette-atlas texture (one mesh, one
// material), so recolor just its swatch. The requested colour is #B7AC99;
// the texel is written a little lighter (#C8C4B0) to compensate for the
// scene's ACES tone mapping so the jacket reads on-screen as that greige
// rather than a muted dark brown.
const JACKET_FROM = [0xde, 0x33, 0x00] as const;
const JACKET_TO = [0xc8, 0xc4, 0xb0] as const;

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

// Cached once from the bind pose. useGLTF shares the scene across mounts, and
// on remount (route navigation back) its skeleton is left in a posed state, so
// re-measuring its bounding box would shift the centering — the "floating /
// offset on return" bug. Measuring once keeps placement stable.
let cachedFit: { scale: number; center: THREE.Vector3 } | null = null;

function introAlreadyPlayed() {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function markIntroPlayed() {
  try {
    sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

/**
 * The hero mascot: the rigged m_7 GLB. On the first landing of a session it
 * walks in from off-screen left in side profile using the real "Walk" cycle,
 * arrives at its resting spot, turns to face the camera, and crossfades into
 * "Idle". On any later mount (route navigation back to the home page) it
 * appears already standing at the resting position — no walk-in, no offset.
 * Idle arms are eased to the A-pose so they hang naturally.
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
    if (cachedFit) return cachedFit;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    // Idempotent cache: the model is a singleton, so this always computes the
    // same value; storing it keeps placement stable across remounts.
    // eslint-disable-next-line react-hooks/globals
    cachedFit = { scale, center };
    return cachedFit;
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

  // Recolor the jacket swatch in the shared texture, once per loaded scene.
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mesh.isMesh || !mat?.map?.image || mat.userData.jacketRecolored) return;
      const img = mat.map.image as CanvasImageSource & { width: number; height: number };
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      const th = 40;
      for (let i = 0; i < d.length; i += 4) {
        if (
          Math.abs(d[i] - JACKET_FROM[0]) < th &&
          Math.abs(d[i + 1] - JACKET_FROM[1]) < th &&
          Math.abs(d[i + 2] - JACKET_FROM[2]) < th
        ) {
          d[i] = JACKET_TO[0];
          d[i + 1] = JACKET_TO[1];
          d[i + 2] = JACKET_TO[2];
        }
      }
      ctx.putImageData(pixels, 0, 0);
      mat.map.image = canvas;
      mat.map.needsUpdate = true;
      mat.userData.jacketRecolored = true;
      mat.needsUpdate = true;
    });
  }, [scene]);

  // Place the character and decide the entrance once (not on resize).
  useEffect(() => {
    const g = root.current;
    if (!g || !idle) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const skipIntro = introAlreadyPlayed() || prefersReduced || !walk;

    if (skipIntro) {
      idle.reset().play();
      phase.current = "idle";
    } else {
      walk.reset().play();
      phase.current = "walk";
    }
    // Defer positioning to the first frame so it uses the measured viewport.
    needStart.current = true;
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
    const groupScale = isMobile ? MOBILE_SCALE : DESKTOP_SCALE;
    const targetX = restingX(state.viewport.width, isMobile);
    // Translation speed scales with the presentation scale so the stride
    // matches the walk cycle's foot strikes at every size (no sliding).
    const worldSpeed = WALK_SPEED_LOCAL * fit.scale * groupScale;

    g.scale.setScalar(groupScale);
    g.position.y = isMobile ? -0.4 : 0;

    // First ready frame: position with the measured viewport.
    if (needStart.current) {
      if (phase.current === "walk") {
        g.position.x = -(state.viewport.width * 0.5 + 0.6); // just off the left edge
        g.rotation.y = FACING_WALK;
      } else {
        g.position.x = targetX; // already-played: stand at rest facing camera
        g.rotation.y = 0;
      }
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
        markIntroPlayed(); // never replay the walk-in this session
      }
    } else {
      // Idle: keep tracking the resting spot — targetX depends on the live
      // viewport, so a resize (especially across the 860px mobile/desktop
      // breakpoint) would otherwise strand the character off-canvas.
      g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, 0.1);
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
      {/* Neutral front fill so the coat's camera-facing surfaces catch light
          and the greige jacket reads as brightly as the light rig allows. */}
      <directionalLight position={[0, 1, 7]} intensity={0.9} color="#ffffff" />
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
