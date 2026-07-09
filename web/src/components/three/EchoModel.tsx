"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { relBox } from "./relBox";

const MODEL = "/arx.glb";
const ACCENT = "#FF375F";
const TARGET_WIDTH = 1.75; // world units the frame's footprint is scaled to fill

// The STEP's propellers are flat placeholder cards (tilt1-4 squares +
// circular1-4 discs) — hidden here and replaced with procedural twisted,
// tapered 2-blade props (standard for a whoop-class ESP32 build) mounted on
// the motor tops. Diagonal pairs counter-rotate, like a real quad.
const PLACEHOLDER_PROPS = /^(tilt[1-4]|circular[1-4])$/;
// motor axes in GLB coords (SOLID001-004 measured): (±0.0354, ±0.0354)
const MOTOR_XY = 0.0354;
const PROP_Y = 0.0205; // just above the motor tops (motors span y 0..0.019)
const PROP_SPIN = 55; // rad/s — reads as a fast blur/strobe

// --- one-time flight entrance (per session) ---
// The drone drops in from above the frame, already at speed, and
// wobble-corrects into a hover: underdamped springs on both axes give the
// characteristic overshoot-and-correct, and the tilt is driven straight from
// the spring velocities so it banks into the motion and self-levels as it
// slows. After settling it never goes fully still — a perpetual subtle hover.
const FLIGHT_KEY = "hx_echo_flight"; // sessionStorage flag
const FLIGHT_TRIGGER = 0.15;
const START_X = 0.9; // enters high and off to the right
const START_Y = 2.4; // fully above the canvas frustum (half-height ~1.22)
const START_VY = -1.5; // already descending as it appears
// x: ω=5, ζ=0.55 — ~13% overshoot past the hover point, one correction back
const XK = 25;
const XC = 5.5;
// y: ω=4.6, ζ=0.7 — dips slightly below hover altitude, then corrects up
const YK = 21;
const YC = 6.4;
const SETTLED_T = 1.6; // springs are visually settled; hand off to hover idle

function flightPlayed() {
  try {
    return sessionStorage.getItem(FLIGHT_KEY) === "1";
  } catch {
    return false;
  }
}

function markFlightPlayed() {
  try {
    sessionStorage.setItem(FLIGHT_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

// Materials authored here, matte from the start (brightness lessons applied):
// no emissive anywhere, metalness only on genuinely metallic parts.
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: "#3D4147", roughness: 0.8, metalness: 0 });
const BODY_MAT = new THREE.MeshStandardMaterial({ color: "#5A5F67", roughness: 0.72, metalness: 0 });
const PCB_MAT = new THREE.MeshStandardMaterial({ color: "#1E4D33", roughness: 0.6, metalness: 0 });
const MOTOR_MAT = new THREE.MeshStandardMaterial({ color: "#8E9298", roughness: 0.35, metalness: 0.7 });
const PIN_MAT = new THREE.MeshStandardMaterial({ color: "#C9A227", roughness: 0.4, metalness: 0.8 });
// props: slightly glossier dark plastic, distinct from the matte frame
const PROP_MAT = new THREE.MeshStandardMaterial({
  color: "#1A1B1E",
  roughness: 0.35,
  metalness: 0,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
});
// spin blur: a genuinely dim translucent disc — not emissive, not bright
const BLUR_MAT = new THREE.MeshBasicMaterial({
  color: "#17181A",
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
});

function materialFor(name: string): THREE.Material {
  if (/^SOLID00[1-4]$/.test(name)) return MOTOR_MAT;
  if (/Pins/.test(name)) return PIN_MAT;
  if (/pcb|XIAO|Seeed|SOLID$|Shield|Body/.test(name)) return PCB_MAT;
  if (/chassis|support/.test(name)) return FRAME_MAT;
  return BODY_MAT;
}

/**
 * A single twisted, tapered prop blade: narrow and steeply pitched at the
 * root, widest mid-span, rounded taper to a flatter tip — built as a lofted
 * strip in GLB units (17mm radius).
 */
function buildBladeGeometry(): THREE.BufferGeometry {
  const SPAN = 12;
  const CHORD = 5;
  const HUB_R = 0.0035;
  const TIP_R = 0.017;
  const MAX_CHORD = 0.0062;
  const pos: number[] = [];
  for (let i = 0; i <= SPAN; i++) {
    const t = i / SPAN;
    const r = THREE.MathUtils.lerp(HUB_R, TIP_R, t);
    const chord =
      MAX_CHORD * (0.45 + 0.55 * Math.sin(Math.PI * (0.18 + 0.82 * t))) * (1 - 0.3 * t * t);
    const twist = 0.62 - 0.44 * t; // ~36° root pitch → ~10° at the tip
    for (let j = 0; j <= CHORD; j++) {
      const c = (j / CHORD - 0.5) * chord;
      pos.push(r, c * Math.sin(twist), c * Math.cos(twist));
    }
  }
  const idx: number[] = [];
  const w = CHORD + 1;
  for (let i = 0; i < SPAN; i++) {
    for (let j = 0; j < CHORD; j++) {
      const a = i * w + j;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PROPS: { x: number; z: number; dir: 1 | -1 }[] = [
  { x: MOTOR_XY, z: MOTOR_XY, dir: 1 },
  { x: -MOTOR_XY, z: -MOTOR_XY, dir: 1 },
  { x: MOTOR_XY, z: -MOTOR_XY, dir: -1 },
  { x: -MOTOR_XY, z: MOTOR_XY, dir: -1 },
];

/**
 * The Arx FPV drone — the real CAD assembly (STEP → GLB) with procedural
 * props. One-time entrance per session: it flies in from above already at
 * speed, overshoots the hover point on both axes and wobble-corrects (tilt
 * driven by velocity, so it banks in and self-levels), then settles into a
 * perpetual subtle hover — bobbing, jittering, props never stopping.
 */
export default function EchoModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null); // scroll yaw
  const rig = useRef<THREE.Group>(null); // flight position + attitude
  const propRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);

  const flight = useRef<{
    phase: "waiting" | "flying" | "hover";
    t: number;
    x: number;
    vx: number;
    y: number;
    vy: number;
    hoverAmt: number;
  } | null>(null);
  if (flight.current == null) {
    const played = flightPlayed();
    flight.current = played
      ? { phase: "hover", t: 0, x: 0, vx: 0, y: 0, vy: 0, hoverAmt: 1 }
      : { phase: "waiting", t: 0, x: START_X, vx: 0, y: START_Y, vy: START_VY, hoverAmt: 0 };
  }

  const { scene } = useGLTF(MODEL);
  const bladeGeo = useMemo(() => buildBladeGeometry(), []);

  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const leftovers: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      if (PLACEHOLDER_PROPS.test(mesh.name)) {
        leftovers.push(mesh); // flat placeholder cards → deleted below
        return;
      }
      // The legs (support1-4) import floating 3mm below the frame plates —
      // an assembly offset in the STEP. Seat them flush with a 0.5mm embed
      // so leg and frame read as one manufactured part.
      if (/^support[1-4]$/.test(mesh.name)) mesh.position.y = 0.0035;
      mesh.material = materialFor(mesh.name);
    });
    for (const m of leftovers) m.removeFromParent();
    const device = relBox(scene, inv);
    const center = device.getCenter(new THREE.Vector3());
    const size = device.getSize(new THREE.Vector3());
    return { center, scale: TARGET_WIDTH / size.x };
  }, [scene]);

  useFrame((state, delta) => {
    // Scroll-linked rotation — same lerp-toward-target pattern as the siblings.
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-20, 16, progress));
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }

    // Props never stop — fast spin in every phase, diagonal pairs opposed.
    for (let i = 0; i < PROPS.length; i++) {
      const p = propRefs.current[i];
      if (p) p.rotation.y += PROPS[i].dir * PROP_SPIN * delta;
    }

    const f = flight.current!;
    if (f.phase === "waiting" && progress >= FLIGHT_TRIGGER) {
      f.phase = "flying";
      f.t = 0;
    }
    if (f.phase === "flying") {
      // Sub-stepped underdamped springs — the overshoot-and-correct IS the
      // physics; no hand-tuned keyframes.
      let remaining = Math.min(delta, 0.1);
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        remaining -= dt;
        f.t += dt;
        f.vx += (-XK * f.x - XC * f.vx) * dt;
        f.x += f.vx * dt;
        f.vy += (-YK * f.y - YC * f.vy) * dt;
        f.y += f.vy * dt;
      }
      if (f.t >= SETTLED_T) {
        f.phase = "hover";
        markFlightPlayed();
      }
    } else if (f.phase === "hover") {
      // springs keep decaying any residual while the hover idle fades in
      f.vx += (-XK * f.x - XC * f.vx) * delta;
      f.x += f.vx * delta;
      f.vy += (-YK * f.y - YC * f.vy) * delta;
      f.y += f.vy * delta;
      f.hoverAmt = Math.min(1, f.hoverAmt + delta / 0.8);
    }

    if (rig.current) {
      const t = state.clock.elapsedTime;
      const h = f.hoverAmt;
      // perpetual hover: slow organic bob + faint positional/attitude jitter
      const bobY = h * (Math.sin(t * 1.3) * 0.022 + Math.sin(t * 2.17) * 0.009);
      const bobX = h * Math.sin(t * 0.9) * 0.01;
      rig.current.position.set(f.x + bobX, f.y + bobY, 0);
      // bank/pitch from velocity: leans into the approach, levels as it slows
      const bank = THREE.MathUtils.clamp(-f.vx * 0.1, -0.18, 0.18) + h * Math.sin(t * 1.7) * 0.008;
      const pitch = THREE.MathUtils.clamp(f.vy * 0.05, -0.14, 0.14) + h * Math.sin(t * 2.3) * 0.006;
      rig.current.rotation.z = bank;
      rig.current.rotation.x = pitch;
    }
  });

  return (
    <>
      {/* Studio three-point rig — the dark matte frame needs more than the
          shared section lights. Materials stay matte/non-emissive, so the
          extra intensity lifts readability without reintroducing glow. */}
      <ambientLight intensity={0.3} color="#ffffff" />
      {/* key: bright, warm, upper-front-right */}
      <directionalLight position={[2.5, 3.5, 4]} intensity={1.7} color="#FFF4E8" />
      {/* fill: soft, cool, opposite side — lifts the shadowed arms */}
      <directionalLight position={[-3.5, 0.8, 2.5]} intensity={0.55} color="#DCE4F0" />
      {/* rim: behind/above, crimson-tinted — edge separation from the dark bg */}
      <directionalLight position={[-1, 2.5, -4]} intensity={1.3} color={ACCENT} />
      {/* static tilt so the frame's top face reads; scroll rotation inside */}
      <group rotation={[0.45, 0, 0]} position={[0, -0.05, 0]}>
        <group ref={group}>
          <group ref={rig}>
            <group scale={layout.scale}>
              <group position={[-layout.center.x, -layout.center.y, -layout.center.z]}>
                <primitive object={scene} />
                {/* procedural props on the motor tops (GLB coords) */}
                {PROPS.map((p, i) => (
                  <group key={i} position={[p.x, PROP_Y, p.z]}>
                    <group
                      ref={(g) => {
                        propRefs.current[i] = g;
                      }}
                    >
                      <mesh geometry={bladeGeo} material={PROP_MAT} />
                      <mesh geometry={bladeGeo} material={PROP_MAT} rotation={[0, Math.PI, 0]} />
                      {/* hub */}
                      <mesh>
                        <cylinderGeometry args={[0.0028, 0.0028, 0.004, 16]} />
                        <meshStandardMaterial color="#26272B" roughness={0.4} metalness={0} />
                      </mesh>
                    </group>
                    {/* spin-blur disc: dim, translucent, non-emissive */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                      <circleGeometry args={[0.0172, 40]} />
                      <primitive object={BLUR_MAT} attach="material" />
                    </mesh>
                  </group>
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
