"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";
import type { SectionPointer } from "@/lib/useSectionPointer";

const MODEL = "/auraeyez.glb";
const ACCENT = "#F0B24A"; // warm amber — matches the device's knob + section glow
const TARGET_WIDTH = 1.55; // world units the 80mm device face is scaled to fill

// GLB mesh names (GLTFLoader strips the dots from Blender's "Body1.008" etc.)
const KNOB_MESHES: readonly string[] = ["Body1008", "Body1009"]; // left (-x) and right (+x) knob caps
const GLASS_MESH = "Body5002"; // the OLED cover glass — the visible display area
const KNOB_MATERIAL = "Paint - Enamel Glossy (Yellow)"; // amber paint kept as-is

// --- OLED screen (canvas texture) geometry, in canvas pixels ---
// Eye look & behaviour follow the FluxGarage RoboEyes library (default mood +
// "curiosity"): solid rounded-rect eyes that slide as a pair toward the gaze
// target; no pupils, no angled lids.
const TEX_W = 512;
const TEX_H = 256;
const EYE_W = 135;
const EYE_H = 155;
const EYE_GAP = 96; // half-distance between the two eye centres
const EYE_R = 41; // corner radius
const EYE_GLOW_BLUR = 22; // soft white halo around each eye (canvas shadow)
const EYE_GLOW = "rgba(255,255,255,0.55)";
const GAZE_RANGE_X = 40; // whole-eye travel toward the cursor
const GAZE_RANGE_Y = 20;
// RoboEyes curiosity: the outer eye on the side the gaze leans toward grows
// taller in proportion to the horizontal displacement (up to 1.18x at full
// lean) — the "leaning in to look" effect.
const CURIOSITY = 0.18;
const BLINK_PERIOD = 4.2; // seconds between blinks
const BLINK_DUR = 0.16; // total blink length

// --- one-time drop-in entrance (per session, like the hero walk-in) ---
// Beats: anticipation hang → gravity fall → impact compression → big slow
// bounce → smaller faster bounce → settle, with the 360° spin timed to land
// alongside the bounces. ~2.1s from trigger to hand-off.
const DROP_KEY = "hx_aura_drop_played"; // sessionStorage flag
const DROP_TRIGGER = 0.15; // section progress at which the drop starts
const DROP_START_Y = 2.1; // world units above rest — just above the frame
const DROP_HOLD = 0.35; // anticipation beat before gravity wins
const GRAVITY = 8; // world units/s² — ~0.72s accelerating fall
// Stiff lossy floor spring engaged while y < 0: every impact squashes for a
// readable beat (~0.12s) and rebounds at ~0.35x speed, so each bounce is both
// smaller and quicker than the last — a real bouncing-object rhythm that a
// single linear spring can't produce.
const FLOOR_K = 800;
const FLOOR_C = 15.5;
// The spin is its own slower damped spring (ω≈3.6, ζ≈0.62): it crosses its
// mark right around first impact, overshoots ~25° with angular momentum and
// wobbles back, settling with the last bounce.
const ROT_K = 13;
const ROT_C = 4.5;

function dropAlreadyPlayed() {
  try {
    return sessionStorage.getItem(DROP_KEY) === "1";
  } catch {
    return false;
  }
}

function markDropPlayed() {
  try {
    sessionStorage.setItem(DROP_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Bounding box of `root`'s meshes in the GLB scene-root frame. `inv` is the
 * inverse of the scene root's matrixWorld: multiplying it in cancels every
 * ancestor transform, so measurements stay correct even when the shared
 * useGLTF scene is still attached to a scaled/rotated tree (e.g. on remount
 * or fast-refresh) — measuring plain world boxes there would be contaminated.
 */
function relBox(root: THREE.Object3D, inv: THREE.Matrix4) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
    box.union(tmp);
  });
  return box;
}

/**
 * The AuraEyez desk assistant — the real CAD assembly (converted GLB) with the
 * interactive layers placed on its actual parts:
 *  - a canvas-textured plane sits on the OLED cover glass, so the RoboEyes
 *    (default mood + curiosity) track the cursor while it is inside the
 *    section and ease back to centre when it leaves — perspective-correct as
 *    the device rotates;
 *  - each rotary knob cap raycasts hover and gets a soft amber halo;
 *  - on its first scroll into view each session it drops in under a damped
 *    spring with a full 360° spin, then hands off to the scroll-scrub;
 *  - the whole device rotates with scroll via the shared progress prop, so
 *    these interactions layer on top of the existing scroll-scrub system.
 */
export default function AuraEyezModel({
  progress,
  pointer,
}: {
  progress: number;
  pointer?: RefObject<SectionPointer>;
}) {
  const group = useRef<THREE.Group>(null);
  const screenMat = useRef<THREE.MeshBasicMaterial>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([null, null]);
  const hovered = useRef([false, false]);
  const glow = useRef([0, 0]);
  const gaze = useRef({ x: 0, y: 0 });

  // Drop-in entrance state; skipped entirely when already played this session.
  const drop = useRef<{
    phase: "waiting" | "hold" | "falling" | "done";
    hold: number;
    y: number;
    vy: number;
    rot: number;
    vrot: number;
  } | null>(null);
  if (drop.current == null) {
    drop.current = dropAlreadyPlayed()
      ? { phase: "done", hold: 0, y: 0, vy: 0, rot: 0, vrot: 0 }
      : { phase: "waiting", hold: 0, y: DROP_START_Y, vy: 0, rot: 0, vrot: 0 };
  }

  const { scene } = useGLTF(MODEL);

  // Measure the CAD assembly once: overall fit, plus where the OLED glass and
  // the two knob caps sit — expressed in the face-to-camera frame (the device
  // face points -Y in the file; the -90° X rotation below turns it to +Z).
  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();

    // Only the knob caps take part in pointer raycasts — the assembly has 67
    // meshes and hover only cares about the knobs. Idempotent on the cached scene.
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!KNOB_MESHES.includes(mesh.name)) mesh.raycast = () => {};
      // The CAD export leaves metallicFactor at the glTF default (1.0), and
      // fully-metallic surfaces render dark without an environment map — the
      // real cause of the body reading heavy. This is plastic: kill the
      // metalness so the near-white shell actually reads light. The amber
      // knob/plate paint keeps its glossy metallic look untouched.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial || seen.has(std)) continue;
        seen.add(std);
        if (std.name !== KNOB_MATERIAL) std.metalness = 0.05;
      }
    });

    const device = relBox(scene, inv);
    const center = device.getCenter(new THREE.Vector3());
    const size = device.getSize(new THREE.Vector3());
    // GLB world point -> position in the rotated frame (device re-centred).
    const post = (x: number, y: number, z: number): [number, number, number] => [
      x - center.x,
      z - center.z,
      -(y - center.y),
    ];

    const glass = scene.getObjectByName(GLASS_MESH);
    const gBox = relBox(glass ?? scene, inv);
    const gCenter = gBox.getCenter(new THREE.Vector3());
    const gSize = gBox.getSize(new THREE.Vector3());

    const knobs = KNOB_MESHES.map((name) => {
      const knob = scene.getObjectByName(name);
      const box = relBox(knob ?? scene, inv);
      const c = box.getCenter(new THREE.Vector3());
      return {
        // halo sits at the knob's base, just proud of the shell face
        pos: post(c.x, box.max.y - 0.0008, c.z),
        radius: (box.max.x - box.min.x) / 2,
      };
    });

    return {
      center,
      scale: TARGET_WIDTH / size.x,
      // eye plane hovers a hair's breadth in front of the cover glass
      eye: { pos: post(gCenter.x, gBox.min.y - 0.0004, gCenter.z), w: gSize.x, h: gSize.z },
      knobs,
    };
  }, [scene]);

  // Soft annular glow sprite for the knob halos — transparent under the knob,
  // peaking just past its edge, fading out. Reads as light, not as a solid ring.
  const halo = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(240,178,74,0)");
    g.addColorStop(0.42, "rgba(240,178,74,0)");
    g.addColorStop(0.56, "rgba(240,178,74,0.85)");
    g.addColorStop(1, "rgba(240,178,74,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  // The OLED canvas + its texture live in a ref (mutable, render-persistent),
  // lazily created once. The Canvas only mounts in the browser (behind an
  // IntersectionObserver), so `document` is always available in this callback.
  const gfx = useRef<{
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
  } | null>(null);
  if (gfx.current == null) {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    gfx.current = { ctx, texture };
  }

  // Redraw the eyes onto the canvas for the given eased gaze offset + blink.
  // RoboEyes default mood: two solid rounded rects that slide as a pair toward
  // the gaze; curiosity grows only the outer eye on the lean side, from centre.
  const draw = (
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
    nx: number,
    ny: number,
    blink: number
  ) => {
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = "#07070a";
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    const oy = ny * GAZE_RANGE_Y;
    const lid = 1 - blink * 0.92; // eye height factor while blinking

    // Pure white eyes with a soft white halo. The glow is a canvas shadow on
    // the same fill, so it moves and reshapes with each eye (gaze + curiosity).
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = EYE_GLOW;
    ctx.shadowBlur = EYE_GLOW_BLUR;
    for (const side of [-1, 1]) {
      const cx = TEX_W / 2 + side * EYE_GAP + nx * GAZE_RANGE_X;
      const cy = TEX_H / 2 + oy;
      // lean ∈ [0,1]: how far the gaze has moved toward this eye's own side
      const lean = Math.max(0, side * nx);
      const h = EYE_H * (1 + CURIOSITY * lean) * lid;

      roundRect(ctx, cx - EYE_W / 2, cy - h / 2, EYE_W, h, EYE_R);
      ctx.fill();
    }
    ctx.restore();
    texture.needsUpdate = true;
  };

  // Knob hover — R3F bubbles child-mesh hits up to the <primitive> handlers,
  // and everything except the knob caps has raycasting disabled above.
  const setKnobHover = (e: ThreeEvent<PointerEvent>, value: boolean) => {
    const i = KNOB_MESHES.indexOf(e.object.name);
    if (i === -1) return;
    if (value) e.stopPropagation();
    hovered.current[i] = value;
  };

  useFrame((state, delta) => {
    const g = gfx.current;
    if (!g) return;

    // Bind the OLED texture to the screen material once it exists.
    if (screenMat.current && screenMat.current.map !== g.texture) {
      screenMat.current.map = g.texture;
      screenMat.current.needsUpdate = true;
    }

    // Scroll target — shared with the siblings' scroll-scrub pattern.
    const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-26, 20, progress));
    const d = drop.current!;
    if (group.current) {
      if (d.phase === "waiting") {
        // Parked above the frame, pre-wound a full turn behind the scroll
        // target; the drop starts the first time the section scrolls into view.
        d.rot = targetY - Math.PI * 2;
        group.current.position.y = d.y;
        group.current.rotation.y = d.rot;
        if (progress >= DROP_TRIGGER) d.phase = "hold";
      } else if (d.phase === "hold") {
        // Anticipation beat: a still hang before the release.
        d.hold += delta;
        group.current.position.y = d.y;
        group.current.rotation.y = d.rot;
        if (d.hold >= DROP_HOLD) d.phase = "falling";
      } else if (d.phase === "falling") {
        // Fixed 1/120s sub-steps: the stiff floor spring is framerate-
        // sensitive at raw frame dt (janky frames inflate the rebound), so
        // integrate in small equal slices for a consistent bounce everywhere.
        let remaining = Math.min(delta, 0.1);
        while (remaining > 0) {
          const dt = Math.min(remaining, 1 / 120);
          remaining -= dt;
          // Ballistic fall under gravity; below the rest line the stiff lossy
          // floor spring takes over — compression beat, then a weaker rebound.
          if (d.y > 0) d.vy -= GRAVITY * dt;
          else d.vy += (-FLOOR_K * d.y - FLOOR_C * d.vy - GRAVITY) * dt;
          d.y += d.vy * dt;
          // The spin keeps its own momentum: overshoots the mark, wobbles back.
          d.vrot += (-ROT_K * (d.rot - targetY) - ROT_C * d.vrot) * dt;
          d.rot += d.vrot * dt;
        }
        group.current.position.y = d.y;
        group.current.rotation.y = d.rot;
        // Hand off once both axes are resting (the floor holds y at ~-0.01);
        // the residual wobble here is a pixel or two — the lerp absorbs it.
        const settled =
          Math.abs(d.y) < 0.03 &&
          Math.abs(d.vy) < 0.45 &&
          Math.abs(d.rot - targetY) < 0.035 &&
          Math.abs(d.vrot) < 0.25;
        if (settled) {
          d.phase = "done";
          group.current.position.y = 0;
          markDropPlayed();
        }
      } else {
        // Scroll-linked rotation — same lerp-toward-target as the siblings.
        group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
      }
    }

    // Eyes: ease the gaze toward the cursor while inside; back to centre when out.
    const p = pointer?.current;
    const tx = p?.inside ? p.x : 0;
    const ty = p?.inside ? p.y : 0;
    gaze.current.x = THREE.MathUtils.lerp(gaze.current.x, tx, 0.12);
    gaze.current.y = THREE.MathUtils.lerp(gaze.current.y, ty, 0.12);

    // Occasional blink (triangular open→closed→open).
    const t = state.clock.elapsedTime % BLINK_PERIOD;
    const half = BLINK_DUR / 2;
    const blink = t < half ? t / half : t < BLINK_DUR ? (BLINK_DUR - t) / half : 0;

    draw(g.ctx, g.texture, gaze.current.x, gaze.current.y, blink);

    // Knob halos: ~180ms ease toward hovered/rest (independent of the eyes).
    for (let i = 0; i < rings.current.length; i++) {
      glow.current[i] = THREE.MathUtils.lerp(glow.current[i], hovered.current[i] ? 1 : 0, 0.15);
      const ring = rings.current[i];
      if (!ring) continue;
      (ring.material as THREE.MeshBasicMaterial).opacity = glow.current[i] * 0.55;
      const s = 1 + glow.current[i] * 0.1;
      ring.scale.set(s, s, 1);
    }
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.6} />
      {/* static tilt for depth; scroll rotation lives on the inner group */}
      <group rotation={[-0.09, 0, 0]}>
        <group ref={group}>
          <group scale={layout.scale}>
            {/* the CAD assembly, re-centred and rotated face-to-camera */}
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <primitive
                object={scene}
                position={[-layout.center.x, -layout.center.y, -layout.center.z]}
                onPointerOver={(e: ThreeEvent<PointerEvent>) => setKnobHover(e, true)}
                onPointerOut={(e: ThreeEvent<PointerEvent>) => setKnobHover(e, false)}
              />
            </group>

            {/* OLED screen: canvas-textured plane on the cover glass (texture bound in useFrame) */}
            <mesh position={layout.eye.pos}>
              <planeGeometry args={[layout.eye.w, layout.eye.h]} />
              <meshBasicMaterial ref={screenMat} toneMapped={false} />
            </mesh>

            {/* knob hover halos */}
            {layout.knobs.map((k, i) => (
              <mesh
                key={i}
                ref={(m) => {
                  rings.current[i] = m;
                }}
                position={k.pos}
              >
                {/* knob edge lands at the gradient's peak (~0.56 of half-extent) */}
                <planeGeometry args={[k.radius * 3.6, k.radius * 3.6]} />
                <meshBasicMaterial
                  map={halo}
                  transparent
                  opacity={0}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
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
