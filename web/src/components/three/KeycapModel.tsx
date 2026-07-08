"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";

const ACCENT = "#30D158";
const MODEL = "/hxkeysair.glb";
const TARGET_LONG = 1.62; // world units the board's long axis is scaled to fill

// GLB group names (GLTFLoader strips the spaces/brackets/colons from the CAD
// names, e.g. "[MX] Normal v1:1" -> "MX_Normal_v11"). The scene frame is
// Z-up: base at z~0.001, PCB ~0.013, switches ~0.02, keycaps ~0.03.
const KEYCAP_NODES: readonly string[] = [
  "MX_Normal_Tilted_v11",
  "MX_Normal_Tilted_v12",
  "MX_Normal_Tilted_v13",
  "MX_Normal_Tilted_v14",
  "MX_Normal_v11",
  "MX_Normal_v12",
  "MX_Normal_v13",
  "MX_Normal_v14",
  "1x2_R3_v61",
  "1x2_R3_v62",
  "Body5012", // encoder knob — drops in with the caps
];
const SWITCH_NODES: readonly string[] = [
  "MX_PCB1",
  "MX_PCB2",
  "MX_PCB3",
  "MX_PCB4",
  "MX_PCB5",
  "MX_PCB6",
  "MX_PCB7",
  "MX_PCB8",
  "MX_PCB9",
  "MX_PCB10",
];
const MCU_NODE = "Arduino_Pro_Micro1";

// --- one-time exploded-assembly entrance (per session) ---
const ASSEMBLE_KEY = "hx_keys_assembled"; // sessionStorage flag
const ASSEMBLE_TRIGGER = 0.15; // section progress at which convergence starts
const HOLD = 0.3; // exploded-view beat before anything moves
const DUR = 0.55; // each part's fall (ease-in: released, then accelerates)
const SNAP_DUR = 0.09; // arrival snap: quick compress into the board + settle
const SNAP_DEPTH = 0.05; // compress amplitude, as a fraction of the part's lift
const KEYCAP_DELAY = 0.14; // keycaps release after the switches (two-stage snap)
const KEYCAP_WAVE = 0.15; // left-to-right stagger across the board
// Exploded lifts along the board's up axis, in GLB units (metres — real scale)
const SWITCH_LIFT = 0.016;
const KEYCAP_LIFT = 0.038;
const MCU_LIFT = 0.026;
const MCU_SIDE = 0.028; // MCU also parks off to the +X side

// --- restrained hover interaction ---
const PRESS_DEPTH = 0.0025; // ~2mm of real key travel

function assembled() {
  try {
    return sessionStorage.getItem(ASSEMBLE_KEY) === "1";
  } catch {
    return false;
  }
}

function markAssembled() {
  try {
    sessionStorage.setItem(ASSEMBLE_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

const hash01 = (i: number) => ((i * 47) % 19) / 19; // deterministic per-part jitter
const easeInCubic = (p: number) => p * p * p;

interface Unit {
  node: THREE.Object3D;
  rest: THREE.Vector3;
  /** node-local direction+magnitude of the exploded offset */
  off: THREE.Vector3;
  /** node-local unit of the board's up axis (for snap dip + key press) */
  up: THREE.Vector3;
  delay: number;
}

/**
 * The Hxkeys Air macropad — the real CAD assembly (converted GLB).
 *  - One-time entrance per session: the parts hold in an exploded stack
 *    (PCB/base in place, switches lifted, keycaps higher with per-part
 *    variation, MCU off to one side), then converge with an ease-in fall and
 *    a tight mechanical snap — switches land first, keycaps follow in a
 *    left-to-right wave.
 *  - Idle: only the shared scroll-scrub rotation plus a barely-perceptible
 *    slow sway. No per-key idle motion.
 *  - Hover: the keycap nearest the cursor depresses ~2mm and springs back
 *    quickly; exactly one key at a time, no glow/color/sound.
 */
export default function KeycapModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const pressed = useRef(-1); // index into keycap units, -1 = none
  const pressAmt = useRef<number[]>([]);

  const asm = useRef<{ phase: "waiting" | "running" | "done"; t: number } | null>(null);
  if (asm.current == null) {
    asm.current = { phase: assembled() ? "done" : "waiting", t: 0 };
  }

  const { scene } = useGLTF(MODEL);

  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();

    // The hover interaction raycasts only against our own invisible plane —
    // the assembly has 170 meshes. CAD export also leaves metallicFactor at
    // the glTF default (1.0), which renders dark without an envmap: plastic.
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial || seen.has(std)) continue;
        seen.add(std);
        std.metalness = 0.05;
      }
    });

    const device = relBox(scene, inv);
    const center = device.getCenter(new THREE.Vector3());
    const size = device.getSize(new THREE.Vector3());

    // Exploded offsets are authored in the GLB frame (up = +Z) and converted
    // into each node's parent-local frame, so setting node.position moves the
    // part exactly along the board's up axis regardless of CAD nesting.
    const rel = new THREE.Matrix4();
    const toLocal = (node: THREE.Object3D, v: THREE.Vector3) => {
      rel.multiplyMatrices(inv, node.parent!.matrixWorld).invert();
      return v.clone().applyMatrix4(rel).sub(new THREE.Vector3().applyMatrix4(rel));
    };

    const makeUnit = (
      name: string,
      lift: number,
      side: number,
      delay: number
    ): Unit | null => {
      const node = scene.getObjectByName(name);
      if (!node || !node.parent) return null;
      const up = toLocal(node, new THREE.Vector3(0, 0, 1));
      const off = up
        .clone()
        .multiplyScalar(lift)
        .add(toLocal(node, new THREE.Vector3(1, 0, 0)).multiplyScalar(side));
      return { node, rest: node.position.clone(), off, up: up.normalize(), delay };
    };

    // Keycap board-plane centres (GLB X-Y, centred) for nearest-cursor lookup.
    const capUnits: Unit[] = [];
    const capXY: { x: number; y: number }[] = [];
    const xs = KEYCAP_NODES.map((n) => {
      const node = scene.getObjectByName(n);
      return node ? relBox(node, inv).getCenter(new THREE.Vector3()).x : 0;
    });
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    KEYCAP_NODES.forEach((name, i) => {
      const wave = maxX > minX ? (xs[i] - minX) / (maxX - minX) : 0;
      const u = makeUnit(
        name,
        KEYCAP_LIFT + hash01(i) * 0.012,
        0,
        KEYCAP_DELAY + wave * KEYCAP_WAVE + hash01(i + 3) * 0.04
      );
      if (!u) return;
      const c = relBox(u.node, inv).getCenter(new THREE.Vector3());
      capUnits.push(u);
      capXY.push({ x: c.x - center.x, y: c.y - center.y });
    });

    const swUnits = SWITCH_NODES.map((n, i) =>
      makeUnit(n, SWITCH_LIFT + hash01(i + 7) * 0.007, 0, hash01(i + 11) * 0.06)
    ).filter((u): u is Unit => u != null);

    const mcu = makeUnit(MCU_NODE, MCU_LIFT, MCU_SIDE, 0.04);
    const moving = [...capUnits, ...swUnits, ...(mcu ? [mcu] : [])];

    return {
      center,
      scale: TARGET_LONG / size.y,
      capUnits,
      capXY,
      moving,
      lastLanding: Math.max(...moving.map((u) => u.delay)) + DUR + SNAP_DUR,
      // invisible hover plane sits just above the assembled keycap tops
      planeZ: device.max.z - center.z + 0.004,
      planeSize: [size.x * 1.3, size.y * 1.15] as [number, number],
    };
  }, [scene]);

  const onPlaneMove = (e: ThreeEvent<PointerEvent>) => {
    const p = e.object.worldToLocal(e.point.clone());
    let best = -1;
    let bd = Infinity;
    layout.capXY.forEach((k, i) => {
      const d = (p.x - k.x) ** 2 + (p.y - k.y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    pressed.current = best;
  };

  useFrame((state, delta) => {
    // Scroll-linked rotation (shared pattern) + a barely-perceptible idle sway.
    if (group.current) {
      const sway = Math.sin(state.clock.elapsedTime * 0.4) * 0.022;
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-24, 18, progress)) + sway;
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }

    // One-time exploded-assembly convergence.
    const a = asm.current!;
    if (a.phase === "waiting" && progress >= ASSEMBLE_TRIGGER) {
      a.phase = "running";
      a.t = 0;
    }
    if (a.phase === "running") a.t += delta;

    for (const u of layout.moving) {
      // f: 1 = fully exploded, 0 = seated. Ease-in fall = released, then
      // accelerates into the board; the landing gets a quick compress-and-
      // settle dip — a mechanical snap, not a bouncy spring.
      let f = 1;
      let dip = 0;
      if (a.phase === "done") {
        f = 0;
      } else if (a.phase === "running") {
        const local = a.t - HOLD - u.delay;
        const p = THREE.MathUtils.clamp(local / DUR, 0, 1);
        f = 1 - easeInCubic(p);
        if (local > DUR && local < DUR + SNAP_DUR) {
          const w = (local - DUR) / SNAP_DUR;
          dip = -Math.sin(Math.PI * w) * SNAP_DEPTH * u.off.length();
        }
      }
      u.node.position.copy(u.rest).addScaledVector(u.off, f).addScaledVector(u.up, dip);
    }
    if (a.phase === "running" && a.t >= HOLD + layout.lastLanding) {
      a.phase = "done";
      for (const u of layout.moving) u.node.position.copy(u.rest);
      markAssembled();
    }

    // Nearest-key hover press: one key at a time, quick tight spring-back.
    // Only active once assembled, so it can't fight the entrance.
    if (pressAmt.current.length !== layout.capUnits.length) {
      pressAmt.current = new Array(layout.capUnits.length).fill(0);
    }
    const canPress = a.phase === "done";
    layout.capUnits.forEach((u, i) => {
      const target = canPress && pressed.current === i ? 1 : 0;
      const amt = THREE.MathUtils.lerp(pressAmt.current[i], target, target ? 0.45 : 0.3);
      pressAmt.current[i] = amt;
      if (amt > 0.001) {
        u.node.position.copy(u.rest).addScaledVector(u.up, -PRESS_DEPTH * amt);
      } else if (canPress) {
        u.node.position.copy(u.rest);
      }
    });
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.6} />
      {/* static tilt so the key field faces the camera; scroll rotation inside */}
      <group rotation={[0.55, 0, 0]} position={[0, -0.12, 0]}>
        <group ref={group}>
          <group scale={layout.scale}>
            {/* GLB is Z-up: rotate the board flat, world up = board up */}
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <group position={[-layout.center.x, -layout.center.y, -layout.center.z]}>
                <primitive object={scene} />
              </group>
              {/* invisible hover plane over the key field — the only raycast target */}
              <mesh
                position={[0, 0, layout.planeZ]}
                onPointerMove={onPlaneMove}
                onPointerOut={() => {
                  pressed.current = -1;
                }}
              >
                <planeGeometry args={layout.planeSize} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL);
