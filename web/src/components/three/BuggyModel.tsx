"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";

const ACCENT = "#30D158";
const MODEL = "/buggy.glb";
const TARGET_LENGTH = 1.35; // world units the buggy's wheelbase axis fills

// GLB node names (from the STEP conversion). The scene frame is: X
// longitudinal (sensor plates at -X, BALL CASTER — the vehicle's FRONT — at
// +X), Y lateral (axle axis), +Z DOWN. The wrappers below stand it upright
// and yaw it 180° so the caster end leads the leftward drive-in.
const WHEEL_GROUPS: readonly string[] = ["Wheel", "Wheel001"]; // tyre + hub per side
const WHEEL_AXLE_GLB_X = -0.128; // axle line in GLB coords (measured)

// --- one-time "vroom" entrance (per session, like the other showcases) ---
const VROOM_KEY = "hx_buggy_vroom"; // sessionStorage flag
const VROOM_TRIGGER = 0.15; // section progress at which the drive-in starts
// Piecewise-physical speed profile (world units/s): a constant-speed entry,
// a mild coasting deceleration, then a hard braking phase — v0 is derived so
// the integrated distance exactly covers START_X → 0.
const T_ENTRY = 0.45; // high-speed entry, constant v0
const T_BRAKE = 1.0; // single continuous braking arc, v0 -> 0
// The braking is jerk-limited: deceleration ramps linearly from zero (so the
// entry hands over with continuous acceleration — one physical event, not
// two stitched eases) and steepens all the way to the stop, which is when
// braking-induced weight transfer naturally peaks. v(t) = v0 - ½k·t²,
// k = 2v0/T², covering exactly (2/3)·v0·T of ground during the brake.
// Start distance ÷ this profile integral gives v0; the start x itself is
// frustum-derived per frame while waiting, so the buggy is always fully
// beyond the canvas' right edge whatever the stage aspect.
const PROFILE_S = T_ENTRY + (2 / 3) * T_BRAKE;
// Braking weight transfer: nose-down pitch, released as a small damped rebound.
const DIP_MAX = THREE.MathUtils.degToRad(3.5);
const DIP_K = 80; // release spring (ζ≈0.5 — one subtle rebound, quick settle)
const DIP_C = 9;
const SPIN_SIGN = -1; // rolling for -x travel; the 180° yaw flips the axle's +Y
const AXLE_AXIS = new THREE.Vector3(0, 1, 0); // GLB-frame lateral axis

function vroomAlreadyPlayed() {
  try {
    return sessionStorage.getItem(VROOM_KEY) === "1";
  } catch {
    return false;
  }
}

function markVroomPlayed() {
  try {
    sessionStorage.setItem(VROOM_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

// Part materials by name stem — the console STEP pipeline can't carry the
// CAD's display colors, so the buggy is dressed here to match its reference
// render: black knobby tyres, plastic hubs, matte plates, green PCBs, red
// gears. Metalness is reserved for the genuinely metal parts (motor cans,
// caster housing); the plastic/laser-cut surfaces are matte dielectrics.
const MATERIALS: [string, THREE.MeshStandardMaterial][] = [
  ["wheelwithout", new THREE.MeshStandardMaterial({ color: "#9EA4AD", metalness: 0, roughness: 0.62 })],
  ["tyre", new THREE.MeshStandardMaterial({ color: "#17181B", metalness: 0, roughness: 0.95 })],
  ["motordriverboard", new THREE.MeshStandardMaterial({ color: "#1F7A3D", metalness: 0.05, roughness: 0.6 })],
  ["stm32mountboard", new THREE.MeshStandardMaterial({ color: "#1F7A3D", metalness: 0.05, roughness: 0.6 })],
  ["motor", new THREE.MeshStandardMaterial({ color: "#3A3F45", metalness: 0.8, roughness: 0.35 })],
  ["gear", new THREE.MeshStandardMaterial({ color: "#B23B2E", metalness: 0, roughness: 0.6 })],
  ["encoder", new THREE.MeshStandardMaterial({ color: "#1E1F22", metalness: 0.05, roughness: 0.65 })],
  ["batteryframe", new THREE.MeshStandardMaterial({ color: "#ACB3BD", metalness: 0, roughness: 0.68 })],
  ["battery", new THREE.MeshStandardMaterial({ color: "#2E3B4E", metalness: 0.05, roughness: 0.6 })],
  ["ballhousing", new THREE.MeshStandardMaterial({ color: "#9AA1AA", metalness: 0.7, roughness: 0.35 })],
  ["ball", new THREE.MeshStandardMaterial({ color: "#26272B", metalness: 0, roughness: 0.85 })],
];
const PLATE_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#969DA8", // light-grey plates ~15% below the old tone — whites at
  // near-unity albedo saturate to a flat glow under any believable lighting
  metalness: 0,
  roughness: 0.72,
});
for (const [, m] of MATERIALS) m.envMapIntensity = 0.08;
PLATE_MATERIAL.envMapIntensity = 0.08;

/**
 * The Land Rover line-follower buggy — the real SolidWorks assembly
 * (STEP → GLB). One-time entrance per session: it drives in fast from the
 * canvas' right edge, ball-caster end (the vehicle's front) leading, wheels
 * pre-spinning, then slows under one continuous jerk-limited braking arc
 * with a front-down weight transfer (whole-chassis approximation — the model
 * has no sprung suspension parts). Wheel rotation is v/r the whole way, so
 * the wheels cease exactly with the chassis; the pitch then releases with a
 * small damped rebound. Hands off to the shared scroll-scrub yaw.
 */
export default function BuggyModel({ progress }: { progress: number }) {
  const yaw = useRef<THREE.Group>(null);
  const drive = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const streaks = useRef<THREE.Mesh[]>([]);

  const vroom = useRef<{
    phase: "waiting" | "driving" | "settling" | "done";
    t: number;
    x: number;
    v0: number; // entry speed, derived from the actual start distance
    speed: number;
    theta: number; // accumulated wheel angle
    dip: number;
    dipV: number;
  } | null>(null);
  if (vroom.current == null) {
    vroom.current = {
      phase: vroomAlreadyPlayed() ? "done" : "waiting",
      t: 0,
      x: 0,
      v0: 1,
      speed: 0,
      theta: 0,
      dip: 0,
      dipV: 0,
    };
  }

  const { scene } = useGLTF(MODEL);

  const gl = useThree((s) => s.gl);
  const envTex = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);

  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();

    // Dress the assembly (materials by part-name stem) + disable raycasting.
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      const n = mesh.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hit = MATERIALS.find(([stem]) => n.startsWith(stem));
      mesh.material = hit ? hit[1] : PLATE_MATERIAL;
    });

    const device = relBox(scene, inv);
    const center = device.getCenter(new THREE.Vector3());
    const size = device.getSize(new THREE.Vector3());

    // Wheel spin pivots: re-parent each Wheel group (tyre + hub) under a
    // fresh pivot placed on its axle centre, so spinning is a plain local
    // rotation regardless of what origins the CAD placements baked in.
    const rel = new THREE.Matrix4();
    let radius = 0.054;
    const pivots: THREE.Object3D[] = [];
    for (const name of WHEEL_GROUPS) {
      const wheel = scene.getObjectByName(name);
      if (!wheel || !wheel.parent) continue;
      const existing = wheel.parent.getObjectByName(`${name}_pivot`);
      if (existing) {
        pivots.push(existing);
        continue;
      }
      const box = relBox(wheel, inv); // GLB scene frame
      radius = box.getSize(new THREE.Vector3()).x / 2;
      const parent = wheel.parent;
      // axle centre, GLB frame -> parent-local
      rel.multiplyMatrices(inv, parent.matrixWorld).invert();
      const pivot = new THREE.Group();
      pivot.name = `${name}_pivot`;
      pivot.position.copy(box.getCenter(new THREE.Vector3()).applyMatrix4(rel));
      parent.add(pivot);
      pivot.updateWorldMatrix(true, false);
      pivot.attach(wheel); // keeps the wheel's world transform
      pivots.push(pivot);
    }

    return {
      center,
      scale: TARGET_LENGTH / size.x,
      radius, // GLB units; world radius = radius * scale
      pivots,
      // pitch pivot on the wheel-axle line. The 180° yaw mirrors GLB x into
      // world x, so the axle lands at +(center - axle)·scale — behind the
      // leading caster: braking pitches the caster end down, rear lifts.
      axleX: (center.x - WHEEL_AXLE_GLB_X) * (TARGET_LENGTH / size.x),
    };
  }, [scene]);

  useFrame((state, delta) => {
    const v = vroom.current!;

    // Shared scroll-scrub yaw — active from the start; it's ~0 while the
    // buggy is driving in (side profile) and eases to the scroll target.
    if (yaw.current) {
      const targetY =
        v.phase === "done" || v.phase === "settling"
          ? THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-24, 14, progress))
          : 0;
      yaw.current.rotation.y = THREE.MathUtils.lerp(yaw.current.rotation.y, targetY, 0.08);
    }

    if (v.phase === "waiting") {
      // Park fully beyond the canvas' right edge, whatever the stage aspect.
      v.x = state.viewport.width / 2 + TARGET_LENGTH * 0.6 + 0.25;
      if (progress >= VROOM_TRIGGER) {
        v.phase = "driving";
        v.t = 0;
        v.v0 = v.x / PROFILE_S;
        v.speed = v.v0;
      }
    }

    if (v.phase === "driving") {
      // Fixed sub-steps: integrate speed -> position -> wheel angle so the
      // rolling stays kinematically exact (θ̇ = v / r) on any framerate.
      const rWorld = layout.radius * layout.scale;
      let remaining = Math.min(delta, 0.1);
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        remaining -= dt;
        v.t += dt;
        if (v.t < T_ENTRY) {
          v.speed = v.v0;
        } else {
          // jerk-limited braking: deceleration ramps continuously from zero
          // and steepens all the way into the stop
          const tb = Math.min(v.t - T_ENTRY, T_BRAKE);
          const k = (2 * v.v0) / (T_BRAKE * T_BRAKE);
          v.speed = Math.max(0, v.v0 - 0.5 * k * tb * tb);
          // weight transfer tracks the actual deceleration (∝ k·tb), so the
          // dip eases in smoothly and peaks exactly as motion ceases
          v.dip = DIP_MAX * THREE.MathUtils.clamp(tb / T_BRAKE, 0, 1);
        }
        v.x = Math.max(0, v.x - v.speed * dt);
        v.theta += (v.speed / rWorld) * dt;
      }
      if (v.t >= T_ENTRY + T_BRAKE || v.x <= 0) {
        v.phase = "settling";
        v.x = 0;
        v.speed = 0;
      }
    } else if (v.phase === "settling") {
      // Suspension release: the nose-dip springs back with a small rebound.
      let remaining = Math.min(delta, 0.1);
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        remaining -= dt;
        v.dipV += (-DIP_K * v.dip - DIP_C * v.dipV) * dt;
        v.dip += v.dipV * dt;
      }
      if (Math.abs(v.dip) < 0.002 && Math.abs(v.dipV) < 0.02) {
        v.phase = "done";
        v.dip = 0;
        markVroomPlayed();
      }
    }

    if (drive.current) drive.current.position.x = v.x;
    if (pitch.current) pitch.current.rotation.z = v.dip;
    // wheels: pure rolling about the axle (local Y in the GLB frame)
    for (const p of layout.pivots) {
      p.quaternion.setFromAxisAngle(AXLE_AXIS, SPIN_SIGN * v.theta);
    }

    // speed streaks: only while genuinely fast, faded by speed²
    const k = THREE.MathUtils.clamp(v.speed / v.v0, 0, 1);
    streaks.current.forEach((m, i) => {
      if (!m) return;
      (m.material as THREE.MeshBasicMaterial).opacity = k * k * (0.22 - i * 0.05);
      m.scale.x = 0.7 + k * 0.6;
    });
  });

  return (
    <>
      <primitive object={envTex} attach="environment" />
      <SceneLights accent={ACCENT} accentIntensity={0.7} level={0.7} ambientScale={0.6} />
      {/* gentle top-down tilt for depth; scroll yaw inside */}
      <group rotation={[0.14, 0, 0]} position={[0, -0.08, 0]}>
        <group ref={yaw}>
          <group ref={drive}>
            {/* braking pitch, pivoted at the front axle so the rear lifts */}
            <group position={[layout.axleX, 0, 0]}>
              <group ref={pitch}>
                <group position={[-layout.axleX, 0, 0]}>
                  <group scale={layout.scale}>
                    {/* 180° yaw leads with the ball caster (GLB +X → world -X) */}
                    <group rotation={[0, Math.PI, 0]}>
                      {/* GLB is +Z-down: +90° X puts it upright */}
                      <group rotation={[Math.PI / 2, 0, 0]}>
                        <group position={[-layout.center.x, -layout.center.y, -layout.center.z]}>
                          <primitive object={scene} />
                        </group>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
            {/* faint speed streaks trailing during the fast entry */}
            {[0, 1, 2].map((i) => (
              <mesh
                key={i}
                ref={(m) => {
                  if (m) streaks.current[i] = m;
                }}
                position={[0.95 + i * 0.18, -0.05 + i * 0.16, 0.1]}
              >
                <planeGeometry args={[0.7, 0.014]} />
                <meshBasicMaterial
                  color="#CFEFDb"
                  transparent
                  opacity={0}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
