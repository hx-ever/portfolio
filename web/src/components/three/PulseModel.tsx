"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";

const MODEL = "/corelink.glb";
const ACCENT = "#2FA093"; // section's new deep-teal theme (family: #24403E)
const TARGET_WIDTH = 1.5; // world units the hub's footprint is scaled to fill

// --- one-time "sensor scan" entrance (per session) ---
// The hub never moves: it sits dormant, then a staggered burst of radar-style
// rings expands from under it and the knob-dome indicators fade on.
const SCAN_KEY = "hx_pulse_scan"; // sessionStorage flag
const SCAN_TRIGGER = 0.15; // section progress at which the burst starts
const RING_STARTS = [0.15, 0.4, 0.65]; // staggered, not simultaneous
const RING_DUR = 0.7; // each ring's expand+fade
const LED_ON_T = 1.0; // indicators fade on as the last pulse dies
const LED_ON_D = 0.4;
const DONE_T = 1.45;
// --- idle: one quiet ring on a slow loop, LED breathing in sync ---
const IDLE_PERIOD = 5;
const IDLE_DUR = 1.8;

const LED_DIM = 0.1; // dormant indicator emissive
const LED_ON = 1.3; // steady "active" emissive — dimmed per the exposure discipline

function scanPlayed() {
  try {
    return sessionStorage.getItem(SCAN_KEY) === "1";
  } catch {
    return false;
  }
}

function markScanPlayed() {
  try {
    sessionStorage.setItem(SCAN_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p);

// The STEP export carries no display colors, so the hub is dressed here —
// matte from the start, applying the brightness lessons from the other three
// models: greyish-white (not #FFF) body, roughness in the matte-plastic
// range, zero metalness, zero emissive except the driven indicators.
const matte = (color: string, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

// Light neutral-grey enclosure with clearly darker controls; the accent
// (section blue) lives only at the technology points — the driven indicator
// domes/slivers and the scan-pulse rings, which already share ACCENT.
// light tints derived from the teal theme, keeping the light-body direction
const BODY_MAT = new THREE.MeshStandardMaterial({ color: "#C4CFCB", roughness: 0.75, metalness: 0.1 });
const CAP_MAT = new THREE.MeshStandardMaterial({ color: "#CBD6D2", roughness: 0.7, metalness: 0.1 });
const PCB_MAT = matte("#1F7A3D", 0.6);
const INLAY_MAT = matte("#2E3136", 0.65);
const MODULE_MAT = matte("#56585E", 0.68);
// knobs carry the deep theme anchor — distinct controls on the light body
const KNOB_MAT = new THREE.MeshStandardMaterial({ color: "#24403E", roughness: 0.55, metalness: 0.2 });
// knob-top domes + their tiny indicator slivers: emissive driven at runtime
const DOME_MAT = new THREE.MeshStandardMaterial({
  color: "#3D4248",
  roughness: 0.45,
  metalness: 0,
  emissive: ACCENT,
  emissiveIntensity: LED_DIM,
});
const LED_MAT = new THREE.MeshStandardMaterial({
  color: "#202326",
  roughness: 0.4,
  metalness: 0,
  emissive: ACCENT,
  emissiveIntensity: LED_DIM,
});
const MAT_BY_NAME: Record<string, THREE.MeshStandardMaterial> = {
  body: BODY_MAT,
  cap: CAP_MAT,
  placeholder: PCB_MAT,
  Component5: PCB_MAT,
  Component6: INLAY_MAT,
  Body1: MODULE_MAT,
  knobleft: KNOB_MAT,
  knobright: KNOB_MAT,
  Component9: DOME_MAT,
  Component10: DOME_MAT,
  Component7: LED_MAT,
  Component8: LED_MAT,
};

/**
 * The CoreLink smart-home hub — the real CAD assembly (STEP → GLB).
 *  - One-time entrance per session: the hub sits in place dormant, then a
 *    staggered burst of expanding radar rings (the device "sensing its
 *    environment") plays and the knob-dome indicators fade to steady-on.
 *  - Idle: one quiet ring on a slow loop with a gentle indicator breath —
 *    continuously sensing, never distracting. No bespoke cursor interaction.
 *  - Shares the sections' scroll-scrub yaw; the model never travels, and the
 *    ring radius is clamped to the live viewport so nothing ever clips.
 */
export default function PulseModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const scan = useRef<{ phase: "waiting" | "running" | "done"; t: number; idle: number } | null>(
    null
  );
  if (scan.current == null) {
    scan.current = { phase: scanPlayed() ? "done" : "waiting", t: 0, idle: 0 };
  }

  const { scene } = useGLTF(MODEL);

  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      mesh.material = MAT_BY_NAME[mesh.name] ?? BODY_MAT;
    });
    const device = relBox(scene, inv);
    const center = device.getCenter(new THREE.Vector3());
    const size = device.getSize(new THREE.Vector3());
    const scale = TARGET_WIDTH / size.x;
    return { center, scale, baseY: (device.min.y - center.y) * scale };
  }, [scene]);

  // Drive one ring mesh for phase p ∈ [0,1] at the given opacity; hidden
  // outside that range.
  const setRing = (i: number, p: number, maxR: number, opacity: number) => {
    const ring = rings.current[i];
    if (!ring) return;
    const mat = ring.material as THREE.MeshBasicMaterial;
    if (p <= 0 || p >= 1) {
      mat.opacity = 0;
      return;
    }
    const r = 0.35 + (maxR - 0.35) * easeOutQuad(p);
    ring.scale.setScalar(r);
    mat.opacity = opacity;
  };

  useFrame((state, delta) => {
    // Scroll-linked rotation — same lerp-toward-target pattern as the siblings.
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-22, 18, progress));
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }

    // Rings stay inside the canvas whatever the stage aspect: clamp the max
    // radius to the live frustum width (the tilt only shrinks their height).
    const maxR = Math.min(1.25, (state.viewport.width / 2) * 0.92);

    const s = scan.current!;
    let led = LED_DIM;
    if (s.phase === "waiting") {
      for (let i = 0; i < 3; i++) setRing(i, 0, maxR, 0);
      if (progress >= SCAN_TRIGGER) {
        s.phase = "running";
        s.t = 0;
      }
    } else if (s.phase === "running") {
      s.t += delta;
      RING_STARTS.forEach((start, i) => {
        const p = (s.t - start) / RING_DUR;
        setRing(i, p, maxR, (1 - p) * 0.5);
      });
      led = LED_DIM + (LED_ON - LED_DIM) * THREE.MathUtils.clamp((s.t - LED_ON_T) / LED_ON_D, 0, 1);
      if (s.t >= DONE_T) {
        s.phase = "done";
        markScanPlayed();
      }
    } else {
      // idle: one quiet ring on a slow loop, indicators breathing with it.
      // Sine envelope: the ring fades IN as it clears the hub's footprint
      // (a linear fade dies before it ever becomes visible), then out.
      s.idle += delta;
      const ip = (s.idle % IDLE_PERIOD) / IDLE_DUR;
      setRing(0, ip, maxR, 0.34 * Math.sin(Math.PI * Math.min(ip, 1)));
      setRing(1, 0, maxR, 0);
      setRing(2, 0, maxR, 0);
      led = LED_ON + (ip < 1 ? 0.25 * Math.sin(Math.PI * ip) : 0);
    }
    DOME_MAT.emissiveIntensity = led * 0.3; // domes glow softer than slivers
    LED_MAT.emissiveIntensity = led;
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.6} level={0.75} ambientScale={0.65} />
      {/* static tilt so the hub's top face reads; scroll rotation inside */}
      <group rotation={[0.52, 0, 0]} position={[0, -0.05, 0]}>
        <group ref={group}>
          <group scale={layout.scale}>
            <group position={[-layout.center.x, -layout.center.y, -layout.center.z]}>
              <primitive object={scene} />
            </group>
          </group>
          {/* radar pulse rings, flat in the device plane just under its base */}
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              ref={(m) => {
                rings.current[i] = m;
              }}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, layout.baseY - 0.02, 0]}
            >
              <ringGeometry args={[0.94, 1, 64]} />
              <meshBasicMaterial
                color={ACCENT}
                transparent
                opacity={0}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
