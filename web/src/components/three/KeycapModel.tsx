"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { useFitClamp, worstCaseHalfExtents } from "./useFitClamp";
import { SECTION_COLORS } from "@/lib/palette";

const ACCENT = SECTION_COLORS.hxkeysair.accent; // soft teal
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

// Dyson-inspired CMF: deep-navy enclosure; the section's saturated
// sky-blue lives ONLY on the keycaps — the surfaces the user's fingers touch.
// Switches beneath stay dark neutral so the interaction point reads alone.
const CAP_ACCENT = ACCENT; // accent keycaps carry the section teal (same hue)
const CASE_MESHES = /^(Structure|Upper_Plate|Lower_Plate|Base)$/;
// enclosure: deep rich navy, matte per the established treatment
const CASE_MAT = new THREE.MeshStandardMaterial({ color: "#1E2C4E", roughness: 0.75, metalness: 0.1 });

// --- one-time exploded-assembly entrance (per session) ---
const ASSEMBLE_KEY = "hx_keys_assembled"; // sessionStorage flag
const ASSEMBLE_TRIGGER = 0.15; // section progress at which convergence starts
const HOLD = 0.3; // exploded-view beat before anything moves
// One damped spring drives every part's convergence (the same integrator
// family as the site's other entrance physics): released from rest it
// genuinely accelerates, velocity stays continuous through arrival, and a
// ~2% overshoot seats it — a tight mechanical snap, not a bounce. Every part
// shares the same spring; only the release delays differ, so the whole
// assembly reads as one coordinated event. Sub-stepped for framerate
// independence.
const SPRING_K = 90;
const SPRING_C = 14.8; // ζ≈0.78 — fall ~0.42s, tiny overshoot, quick settle
const SETTLE_TAIL = 0.85; // per-part time from release to visually seated
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

interface Unit {
  node: THREE.Object3D;
  rest: THREE.Vector3;
  /** node-local direction+magnitude of the exploded offset */
  off: THREE.Vector3;
  /** node-local unit of the board's up axis (for the key press) */
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
  // per-part spring state for the convergence (1 = exploded, 0 = seated)
  const springs = useRef<{ s: number; v: number }[]>([]);

  const asm = useRef<{ phase: "waiting" | "running" | "done"; t: number } | null>(null);
  if (asm.current == null) {
    asm.current = { phase: assembled() || prefersReducedMotion() ? "done" : "waiting", t: 0 };
  }

  const { scene } = useGLTF(MODEL);

  // Procedural room environment (no assets), scoped to this section's own
  // Canvas — it's what gives the plastics believable surface response instead
  // of a flat, uniformly-lit look.
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

    // The hover interaction raycasts only against our own invisible plane —
    // the assembly has 170 meshes. CAD export also leaves metallicFactor at
    // the glTF default (1.0), which renders dark without an envmap: plastic.
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};
      if (CASE_MESHES.test(mesh.name)) {
        mesh.material = CASE_MAT; // deep-navy enclosure
        return;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial || seen.has(std)) continue;
        seen.add(std);
        // Matte plastic. The CAD export ships metallicFactor=1, semi-gloss
        // roughness (0.55) and specularColorFactor=2 (double the physical
        // dielectric F0) on every material — the glossy/plasticky look.
        // Zero metalness, matte roughness, plastic-range specular.
        std.metalness = 0;
        std.roughness = Math.max(std.roughness, 0.78);
        std.envMapIntensity = 0.06;
        const body = std as THREE.MeshPhysicalMaterial;
        if (body.isMeshPhysicalMaterial) {
          body.specularIntensity = 0.35;
          body.specularColor.setScalar(1);
        }
        // Near-white albedo saturates under any believable lighting — dim
        // the light plastics ~15%, once (materials are cached across mounts).
        if (!std.userData.albedoDimmed) {
          std.userData.albedoDimmed = true;
          const c = std.color;
          if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.55) c.multiplyScalar(0.85);
        }
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

    // Switches keep their original imported materials (white housings, amber
    // stems), per the reverted treatment — only the caps carry the accent.
    const swUnits = SWITCH_NODES.map((n, i) =>
      makeUnit(n, SWITCH_LIFT + hash01(i + 7) * 0.007, 0, hash01(i + 11) * 0.06)
    ).filter((u): u is Unit => u != null);

    const mcu = makeUnit(MCU_NODE, MCU_LIFT, MCU_SIDE, 0.04);
    const moving = [...capUnits, ...swUnits, ...(mcu ? [mcu] : [])];

    // Keycap plastic reads smoother than the matte case/PCB: cap meshes get
    // cloned materials with a subtle clearcoat sheen (cloned so parts that
    // share a material with the caps keep their matte finish).
    const capClones = new Map<THREE.Material, THREE.Material>();
    const capMaterial = (m: THREE.Material) => {
      if (m.userData.capClone) return m; // already themed on a previous mount
      let clone = capClones.get(m);
      if (!clone) {
        clone = m.clone();
        clone.userData.capClone = true;
        const phys = clone as THREE.MeshPhysicalMaterial;
        // Caps sit a touch smoother than the 0.78-matte case (realistic for
        // moulded keycap plastic) — but still clearly matte, minimal coat.
        phys.color.set(CAP_ACCENT); // the saturated interaction-point accent
        phys.metalness = 0;
        phys.roughness = 0.62;
        phys.envMapIntensity = 0.15;
        if (phys.isMeshPhysicalMaterial) {
          phys.specularIntensity = 0.4;
          phys.specularColor.setScalar(1);
          phys.clearcoat = 0.04;
          phys.clearcoatRoughness = 0.5;
        }
        capClones.set(m, clone);
      }
      return clone;
    };
    for (const u of capUnits) {
      u.node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(capMaterial)
          : capMaterial(mesh.material);
      });
    }

    // Worst-case on-screen extents for the shared fit clamp: the measured
    // box is expanded to the exploded-entrance envelope (keycap lift + max
    // jitter along GLB +Z, MCU side park along +X) and swept across the
    // scroll-scrub yaw range. The tilt group's -0.12 y offset is folded in.
    const scale = TARGET_LONG / size.y;
    const explodedSize = size.clone();
    explodedSize.z += KEYCAP_LIFT + 0.012;
    explodedSize.x += MCU_SIDE;
    const fitHalf = worstCaseHalfExtents(
      explodedSize.multiplyScalar(scale),
      (yaw) => [
        new THREE.Euler(0.55, 0, 0),
        new THREE.Euler(0, yaw, 0),
        new THREE.Euler(-Math.PI / 2, 0, 0),
      ],
      [-24, 0, 18]
    );
    fitHalf.h += 0.12;

    return {
      center,
      scale,
      fitHalf,
      capUnits,
      capXY,
      moving,
      lastLanding: Math.max(...moving.map((u) => u.delay)) + SETTLE_TAIL,
      // invisible hover plane sits just above the assembled keycap tops
      planeZ: device.max.z - center.z + 0.004,
      planeSize: [size.x * 1.3, size.y * 1.15] as [number, number],
    };
  }, [scene]);

  const fitGroup = useFitClamp(layout.fitHalf.w, layout.fitHalf.h);

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
    if (springs.current.length !== layout.moving.length) {
      springs.current = layout.moving.map(() => ({ s: 1, v: 0 }));
    }
    if (a.phase === "waiting") {
      for (const u of layout.moving) u.node.position.copy(u.rest).addScaledVector(u.off, 1);
    } else if (a.phase === "running") {
      // Fixed sub-steps keep the shared spring identical on every framerate;
      // each part starts integrating once its release delay has elapsed.
      let remaining = Math.min(delta, 0.1);
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        remaining -= dt;
        a.t += dt;
        for (let i = 0; i < layout.moving.length; i++) {
          if (a.t - HOLD - layout.moving[i].delay <= 0) continue;
          const sp = springs.current[i];
          sp.v += (-SPRING_K * sp.s - SPRING_C * sp.v) * dt;
          sp.s += sp.v * dt;
        }
      }
      layout.moving.forEach((u, i) => {
        u.node.position.copy(u.rest).addScaledVector(u.off, springs.current[i].s);
      });
      if (a.t >= HOLD + layout.lastLanding) {
        a.phase = "done";
        for (const u of layout.moving) u.node.position.copy(u.rest);
        markAssembled();
      }
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
      <primitive object={envTex} attach="environment" />
      <SceneLights accent={ACCENT} accentIntensity={0.6} level={0.58} ambientScale={0.6} />
      {/* static tilt so the key field faces the camera; scroll rotation inside */}
      <group rotation={[0.55, 0, 0]} position={[0, -0.12, 0]}>
        <group ref={group}>
          <group ref={fitGroup}>
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
      </group>
    </>
  );
}

// No module-level useGLTF.preload here: the five showcase GLBs are warmed
// in page order by ModelPrefetcher during idle time after first paint,
// instead of six parallel fetches competing with the initial load.
