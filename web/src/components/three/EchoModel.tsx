"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { relBox } from "./relBox";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { useFitClamp } from "./useFitClamp";

const MODEL = "/arx.glb";
const ACCENT = "#FF375F";
const TARGET_WIDTH = 1.6; // world units the frame's footprint is scaled to fill
// Worst-case half-extents of the assembled drone as presented (diagonal
// footprint under scroll yaw + tilt + hover jitter), used by the live
// fit-clamp that guarantees the model never touches the canvas edge.
const FIT_HALF_W = 1.02;
const FIT_HALF_H = 0.88;
// The echo canvas bleeds this many px above its stage (see .bleedTop in
// Showcase.module.css) so the flight-in entry line sits at the section's top
// edge; the comp group below rescales/shifts the scene to keep the on-screen
// composition identical to the unbled stage.
const BLEED_PX = 160;

// The STEP's propellers are flat placeholder cards (tilt1-4 squares +
// circular1-4 discs) — hidden here and replaced with procedural twisted,
// tapered 2-blade props (standard for a whoop-class ESP32 build) mounted on
// the motor tops. Diagonal pairs counter-rotate, like a real quad.
// The STEP's placeholder propellers are THREE families of flat geometry per
// mount (census-verified at all four): the fan_v* bars (45mm rectangles at
// blade height — the visible offenders), plus the tilt* square sheets and
// circular* discs parked at the frame's underside.
const PLACEHOLDER_PROPS = /^(tilt[1-4]|circular[1-4]|fan_v\d+)$/;
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
// no emissive anywhere, metalness only on genuinely metallic parts. The frame
// is tied to the section's deep crimson/plum background rather than neutral
// graphite — a warm dark gunmetal (R>B>G, a plum undertone) — but NOT one
// flat tone: the three structural families sit at deliberately different
// values so the drone reads as a manufactured object with distinct
// components. Crimson accents still live only at the prop tips + motor rings.
// The studio rig below keeps all three tones clearly lit against the dark bg.
const FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#54444A", // arms/chassis — the structural mid-tone anchor
  roughness: 0.76,
  metalness: 0.12,
});
const BODY_MAT = new THREE.MeshStandardMaterial({
  color: "#5E4C52", // central hub/upper body — a step lighter + warmer, reads as the core
  roughness: 0.7,
  metalness: 0.12,
});
// landing legs — deeper and a touch cooler than the arms, so they recede
// slightly (like a different-finish underside part on a real airframe).
const LEG_MAT = new THREE.MeshStandardMaterial({
  color: "#443A40",
  roughness: 0.8,
  metalness: 0.1,
});
const PCB_MAT = new THREE.MeshStandardMaterial({
  color: "#1E4D33",
  roughness: 0.6,
  metalness: 0,
});
const MOTOR_MAT = new THREE.MeshStandardMaterial({
  color: "#8E9298",
  roughness: 0.35,
  metalness: 0.7,
});
const PIN_MAT = new THREE.MeshStandardMaterial({
  color: "#C9A227",
  roughness: 0.4,
  metalness: 0.8,
});
// props: slightly glossier dark plastic, distinct from the matte frame
const TIP_ACCENT = "#FF375F"; // saturated crimson — prop tips + motor rings
const RING_MAT = new THREE.MeshStandardMaterial({
  color: TIP_ACCENT,
  roughness: 0.4,
  metalness: 0.3,
});
const PROP_MAT = new THREE.MeshStandardMaterial({
  color: "#FFFFFF", // multiplied by per-vertex colors: dark blade, crimson tip
  vertexColors: true,
  roughness: 0.35,
  metalness: 0,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
});
// spin blur: a genuinely dim translucent disc — not emissive, not bright.
// Only shown while the entrance flight is at speed: its opacity is driven
// per-frame (fades out with the hover settle, absent at idle and on
// replay-skipped sessions).
const BLUR_MAT = new THREE.MeshBasicMaterial({
  color: "#17181A",
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const BLUR_PEAK = 0.3;

function materialFor(name: string): THREE.Material {
  if (/^SOLID00[1-4]$/.test(name)) return MOTOR_MAT;
  if (/Pins/.test(name)) return PIN_MAT;
  if (/pcb|XIAO|Seeed|SOLID$|Shield|Body/.test(name)) return PCB_MAT;
  if (/support/.test(name)) return LEG_MAT; // landing legs — own finish
  if (/chassis/.test(name)) return FRAME_MAT; // arms/frame
  return BODY_MAT; // central hub / upper body
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
  const col: number[] = [];
  const dark = new THREE.Color("#1A1B1E");
  const tip = new THREE.Color(TIP_ACCENT);
  const mixed = new THREE.Color();
  for (let i = 0; i <= SPAN; i++) {
    const t = i / SPAN;
    const r = THREE.MathUtils.lerp(HUB_R, TIP_R, t);
    const chord =
      MAX_CHORD *
      (0.45 + 0.55 * Math.sin(Math.PI * (0.18 + 0.82 * t))) *
      (1 - 0.3 * t * t);
    const twist = 0.62 - 0.44 * t; // ~36° root pitch → ~10° at the tip
    // Dyson CMF accent: the outer ~quarter of each blade blends to crimson
    const tipMix = THREE.MathUtils.smoothstep(t, 0.72, 0.95);
    mixed.copy(dark).lerp(tip, tipMix);
    for (let j = 0; j <= CHORD; j++) {
      const c = (j / CHORD - 0.5) * chord;
      pos.push(r, c * Math.sin(twist), c * Math.cos(twist));
      col.push(mixed.r, mixed.g, mixed.b);
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
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
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
  // live fit-to-frustum clamp (shared site-wide discipline): shrink the
  // model — not the flight path — whenever the stage aspect leaves less room
  // than the drone's worst-case projected extents.
  const fitGroup = useFitClamp(FIT_HALF_W, FIT_HALF_H);
  const comp = useRef<THREE.Group>(null); // canvas top-bleed compensation
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
    const played = flightPlayed() || prefersReducedMotion();
    flight.current = played
      ? { phase: "hover", t: 0, x: 0, vx: 0, y: 0, vy: 0, hoverAmt: 1 }
      : {
          phase: "waiting",
          t: 0,
          x: START_X,
          vx: 0,
          y: START_Y,
          vy: START_VY,
          hoverAmt: 0,
        };
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
    for (const m of leftovers) {
      // The motor cans nest under the fan-bar nodes in the CAD tree: re-home
      // any children (attach preserves their world transform) before deleting
      // the placeholder itself.
      for (const child of [...m.children]) m.parent?.attach(child);
      m.removeFromParent();
    }
    const device = relBox(scene, inv);
    const center = device.getCenter(new THREE.Vector3());
    const size = device.getSize(new THREE.Vector3());
    return { center, scale: TARGET_WIDTH / size.x };
  }, [scene]);

  useFrame((state, delta) => {
    // Scroll-linked rotation — same lerp-toward-target pattern as the siblings.
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(
        THREE.MathUtils.lerp(-20, 16, progress),
      );
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        targetY,
        0.08,
      );
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
      // springs keep decaying any residual while the hover idle fades in.
      // delta is clamped: resuming from a paused frameloop hands the first
      // frame a multi-second delta, which would blow up the Euler springs.
      const dt = Math.min(delta, 0.1);
      f.vx += (-XK * f.x - XC * f.vx) * dt;
      f.x += f.vx * dt;
      f.vy += (-YK * f.y - YC * f.vy) * dt;
      f.y += f.vy * dt;
      f.hoverAmt = Math.min(1, f.hoverAmt + dt / 0.8);
    }

    // blur discs: full while the flight is at speed, fading with the hover
    // settle, absent at idle (and from frame one on replay-skipped sessions)
    BLUR_MAT.opacity = BLUR_PEAK * (1 - f.hoverAmt);
    BLUR_MAT.visible = BLUR_MAT.opacity > 0.01;

    // Bleed compensation: the canvas is BLEED_PX taller than the stage (all
    // extra at the top), so scale/shift the scene to render exactly as it
    // would in the unbled stage — the headroom exists purely to contain the
    // flight-in path.
    if (comp.current) {
      const h = state.size.height;
      const s = Math.max(0.5, (h - BLEED_PX) / h);
      comp.current.scale.setScalar(s);
      comp.current.position.y = -(2.44 * (BLEED_PX / 2)) / h;
    }

    if (rig.current) {
      const t = state.clock.elapsedTime;
      const h = f.hoverAmt;
      // perpetual hover: slow organic bob + faint positional/attitude jitter
      const bobY = h * (Math.sin(t * 1.3) * 0.022 + Math.sin(t * 2.17) * 0.009);
      const bobX = h * Math.sin(t * 0.9) * 0.01;
      rig.current.position.set(f.x + bobX, f.y + bobY, 0);
      // bank/pitch from velocity: leans into the approach, levels as it slows
      const bank =
        THREE.MathUtils.clamp(-f.vx * 0.1, -0.18, 0.18) +
        h * Math.sin(t * 1.7) * 0.008;
      const pitch =
        THREE.MathUtils.clamp(f.vy * 0.05, -0.14, 0.14) +
        h * Math.sin(t * 2.3) * 0.006;
      rig.current.rotation.z = bank;
      rig.current.rotation.x = pitch;
    }
  });

  return (
    <>
      {/* Studio three-point rig + soft non-directional base — the matte frame
          needs bright, EVEN coverage. Materials stay matte/non-emissive, so
          the intensity lifts readability without reintroducing glow. */}
      <ambientLight intensity={0.5} color="#ffffff" />
      {/* hemisphere: soft omnidirectional fill that reaches every face the
          directionals miss — evens out the dark patches across the arms */}
      <hemisphereLight args={["#F4F6F8", "#383C42", 0.65]} />
      {/* key: bright, warm, upper-front-right */}
      <directionalLight
        position={[2.5, 3.5, 4]}
        intensity={2.0}
        color="#FFF4E8"
      />
      {/* fill: soft, cool, front-left — lifts the side the key misses */}
      <directionalLight
        position={[-4, 1.5, 3]}
        intensity={0.9}
        color="#DCE4F0"
      />
      {/* rim: behind/above, crimson-tinted — edge separation from the dark bg */}
      <directionalLight
        position={[-1, 2.5, -4]}
        intensity={1.4}
        color={ACCENT}
      />
      {/* static tilt so the frame's top face reads; scroll rotation inside */}
      <group ref={comp}>
        <group rotation={[0.45, 0, 0]} position={[0, -0.05, 0]}>
          <group ref={group}>
            <group ref={rig}>
              <group ref={fitGroup}>
                <group scale={layout.scale}>
                  <group
                    position={[
                      -layout.center.x,
                      -layout.center.y,
                      -layout.center.z,
                    ]}
                  >
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
                          <mesh
                            geometry={bladeGeo}
                            material={PROP_MAT}
                            rotation={[0, Math.PI, 0]}
                          />
                          {/* hub */}
                          <mesh>
                            <cylinderGeometry
                              args={[0.0028, 0.0028, 0.004, 16]}
                            />
                            <meshStandardMaterial
                              color="#26272B"
                              roughness={0.4}
                              metalness={0}
                            />
                          </mesh>
                        </group>
                        {/* crimson motor-mount ring — the accent at the tech point */}
                        <mesh
                          position={[0, -0.002, 0]}
                          rotation={[Math.PI / 2, 0, 0]}
                        >
                          <torusGeometry args={[0.0036, 0.0009, 12, 32]} />
                          <primitive object={RING_MAT} attach="material" />
                        </mesh>
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
        </group>
      </group>
    </>
  );
}

// No module-level useGLTF.preload here: the five showcase GLBs are warmed
// in page order by ModelPrefetcher during idle time after first paint,
// instead of six parallel fetches competing with the initial load.
