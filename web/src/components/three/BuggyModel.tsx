"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { useFitClamp, worstCaseHalfExtents } from "./useFitClamp";

const ACCENT = "#30D158";
const MODEL = "/buggy.glb";
const TARGET_LENGTH = 1.55; // world units the buggy's wheelbase axis fills (+15%)

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
// CAD's display colors, so the buggy is dressed here. Dyson-inspired CMF:
// graphite engineered chassis with the section's saturated green concentrated
// on the visible PCB/electronics layer (the "technology" highlight); wheels
// stay dark neutral grounding elements. Metalness is reserved for the
// genuinely metal parts (motor cans, caster housing).
const MATERIALS: [string, THREE.MeshStandardMaterial][] = [
  ["wheelwithout", new THREE.MeshStandardMaterial({ color: "#37383C", metalness: 0.1, roughness: 0.62 })],
  ["tyre", new THREE.MeshStandardMaterial({ color: "#17181B", metalness: 0, roughness: 0.95 })],
  ["motor", new THREE.MeshStandardMaterial({ color: "#3A3F45", metalness: 0.8, roughness: 0.35 })],
  ["gear", new THREE.MeshStandardMaterial({ color: "#3E4046", metalness: 0.1, roughness: 0.6 })],
  ["encoder", new THREE.MeshStandardMaterial({ color: "#1E1F22", metalness: 0.05, roughness: 0.65 })],
  ["batteryframe", new THREE.MeshStandardMaterial({ color: "#333B36", metalness: 0.15, roughness: 0.72 })],
  ["battery", new THREE.MeshStandardMaterial({ color: "#2E3B4E", metalness: 0.05, roughness: 0.6 })],
  ["ballhousing", new THREE.MeshStandardMaterial({ color: "#9AA1AA", metalness: 0.7, roughness: 0.35 })],
  ["ball", new THREE.MeshStandardMaterial({ color: "#26272B", metalness: 0, roughness: 0.85 })],
];
// Chassis: dark with a subtle cool-green undertone — coordinated with the
// section's green accent, premium rather than flat black.
const PLATE_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#333B36",
  metalness: 0.15,
  roughness: 0.72,
});

// PCB palette matched per-component to the reference renders: green
// substrate, bright-green terminal blocks, blue electrolytic sleeve, silver
// fuse + clips, brass terminal screws, matte-black ICs, black connector
// housings and light pin-header strips.
const PCB_GREEN = new THREE.MeshStandardMaterial({ color: "#237A3C", metalness: 0.05, roughness: 0.55 });
const TERMINAL_GREEN = new THREE.MeshStandardMaterial({ color: "#52D96A", metalness: 0, roughness: 0.5 });
const CAP_BLUE = new THREE.MeshStandardMaterial({ color: "#2A36A0", metalness: 0.1, roughness: 0.4 });
const SILVER = new THREE.MeshStandardMaterial({ color: "#B9BEC4", metalness: 0.85, roughness: 0.3 });
const GOLD = new THREE.MeshStandardMaterial({ color: "#C9A227", metalness: 0.85, roughness: 0.35 });
const IC_BLACK = new THREE.MeshStandardMaterial({ color: "#141518", metalness: 0.05, roughness: 0.55 });
const CONNECTOR_BLACK = new THREE.MeshStandardMaterial({ color: "#1B1C1F", metalness: 0.05, roughness: 0.5 });
const HEADER_LIGHT = new THREE.MeshStandardMaterial({ color: "#C7CBD1", metalness: 0.3, roughness: 0.45 });
const PCB_PALETTE = [PCB_GREEN, TERMINAL_GREEN, CAP_BLUE, SILVER, GOLD, IC_BLACK, CONNECTOR_BLACK, HEADER_LIGHT];

// Motor driver board: distinct parts identified from the measured sub-mesh
// census (positions/sizes) matched against the reference photo.
const DRIVER_EXPLICIT: Record<string, THREE.Material> = {
  motordriverboard: PCB_GREEN, // substrate
  motordriverboard001: TERMINAL_GREEN, // edge terminal block
  motordriverboard002: TERMINAL_GREEN,
  motordriverboard003: TERMINAL_GREEN,
  motordriverboard004: TERMINAL_GREEN,
  motordriverboard005: CAP_BLUE, // electrolytic — blue sleeve
  motordriverboard048: SILVER, // fuse clips + glass body
  motordriverboard049: SILVER,
  motordriverboard050: SILVER,
  motordriverboard051: SILVER,
  motordriverboard052: CONNECTOR_BLACK, // large black package
};
// STM32 mount board: substrate + big black connector + two light header
// strips with silver pin rows (six sub-meshes, measured).
const STM_EXPLICIT: Record<string, THREE.Material> = {
  stm32mountboard: PCB_GREEN,
  stm32mountboard001: CONNECTOR_BLACK,
  stm32mountboard002: HEADER_LIGHT,
  stm32mountboard003: SILVER,
  stm32mountboard004: HEADER_LIGHT,
  stm32mountboard005: SILVER,
};

/** Size-rule fallback for the driver board's dozens of small parts. */
function driverPartMaterial(n: string, sizeMM: THREE.Vector3): THREE.Material {
  const explicit = DRIVER_EXPLICIT[n];
  if (explicit) return explicit;
  const h = sizeMM.z;
  const big = Math.max(sizeMM.x, sizeMM.y);
  if (big >= 2 && big <= 3 && h <= 3.5) return GOLD; // terminal screws
  if (h >= 6 && big <= 2.5) return SILVER; // component legs / wire posts
  return IC_BLACK; // SOICs, SMDs, everything else
}
for (const [, m] of MATERIALS) m.envMapIntensity = 0.08;
PLATE_MATERIAL.envMapIntensity = 0.08;
for (const m of PCB_PALETTE) m.envMapIntensity = 0.08;

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
      phase: vroomAlreadyPlayed() || prefersReducedMotion() ? "done" : "waiting",
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

    // Dress the assembly + disable raycasting. The two PCBs get reference-
    // accurate per-component colors; everything else by part-name stem.
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      const n = mesh.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (n.startsWith("motordriverboard")) {
        const s = relBox(mesh, inv).getSize(new THREE.Vector3()).multiplyScalar(1000);
        mesh.material = driverPartMaterial(n, s);
        return;
      }
      if (n.startsWith("stm32mountboard")) {
        mesh.material = STM_EXPLICIT[n] ?? IC_BLACK;
        return;
      }
      // interboard pin connectors + their plates: black housings
      if (n.startsWith("connector") || n.startsWith("connplate")) {
        mesh.material = CONNECTOR_BLACK;
        return;
      }
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

    // Worst-case on-screen extents across the scroll-scrub yaw range for the
    // shared fit clamp (chain mirrors the JSX nesting; the tilt group's
    // -0.08 y offset is folded into the half-height).
    const scale = TARGET_LENGTH / size.x;
    const fitHalf = worstCaseHalfExtents(
      size.clone().multiplyScalar(scale),
      (yaw) => [
        new THREE.Euler(0.14, 0, 0),
        new THREE.Euler(0, yaw, 0),
        new THREE.Euler(0, Math.PI, 0),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ],
      [-24, 0, 14]
    );
    fitHalf.h += 0.08;

    return {
      center,
      scale,
      fitHalf,
      radius, // GLB units; world radius = radius * scale
      pivots,
      // pitch pivot on the wheel-axle line. The 180° yaw mirrors GLB x into
      // world x, so the axle lands at +(center - axle)·scale — behind the
      // leading caster: braking pitches the caster end down, rear lifts.
      axleX: (center.x - WHEEL_AXLE_GLB_X) * (TARGET_LENGTH / size.x),
    };
  }, [scene]);

  const fitGroup = useFitClamp(layout.fitHalf.w, layout.fitHalf.h);

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
            {/* fit clamp scales the vehicle, never the drive-in path */}
            <group ref={fitGroup}>
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
      </group>
    </>
  );
}

// No module-level useGLTF.preload here: the five showcase GLBs are warmed
// in page order by ModelPrefetcher during idle time after first paint,
// instead of six parallel fetches competing with the initial load.
