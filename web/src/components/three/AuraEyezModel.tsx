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

// --- OLED screen (canvas texture) geometry, in canvas pixels ---
const TEX_W = 512;
const TEX_H = 256;
const EYE_W = 150;
const EYE_H = 172;
const EYE_GAP = 96; // half-distance between the two eye centres
const PUPIL_W = 74;
const PUPIL_H = 82;
const PUPIL_RANGE_X = 26; // max pupil travel toward cursor (subtle)
const PUPIL_RANGE_Y = 22;
const BLINK_PERIOD = 4.2; // seconds between blinks
const BLINK_DUR = 0.16; // total blink length

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
 *    track the cursor (eased) while it is inside the section and ease back to
 *    centre when it leaves — perspective-correct as the device rotates;
 *  - each rotary knob cap raycasts hover and gets a soft amber halo;
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
  const pupil = useRef({ x: 0, y: 0 });

  const { scene } = useGLTF(MODEL);

  // Measure the CAD assembly once: overall fit, plus where the OLED glass and
  // the two knob caps sit — expressed in the face-to-camera frame (the device
  // face points -Y in the file; the -90° X rotation below turns it to +Z).
  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();

    // Only the knob caps take part in pointer raycasts — the assembly has 67
    // meshes and hover only cares about the knobs. Idempotent on the cached scene.
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !KNOB_MESHES.includes(mesh.name)) mesh.raycast = () => {};
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

  // Redraw the eyes onto the canvas for the given eased pupil offset + blink.
  const draw = (
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
    px: number,
    py: number,
    blink: number
  ) => {
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = "#07070a";
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    const cy = TEX_H / 2;
    const ox = px * PUPIL_RANGE_X;
    const oy = py * PUPIL_RANGE_Y;
    const lid = 1 - blink * 0.9; // eye height factor while blinking

    for (const sign of [-1, 1]) {
      const cx = TEX_W / 2 + sign * EYE_GAP;
      const h = EYE_H * lid;

      // eye body — warm amber, subtle vertical gradient (OLED "on" look)
      const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
      g.addColorStop(0, "#FFD98C");
      g.addColorStop(1, "#EEA53A");
      ctx.fillStyle = g;
      roundRect(ctx, cx - EYE_W / 2, cy - h / 2, EYE_W, h, 46 * lid);
      ctx.fill();

      if (blink < 0.45) {
        // pupil — dark rounded square shifted toward the cursor
        ctx.fillStyle = "#0b0b0e";
        roundRect(ctx, cx - PUPIL_W / 2 + ox, cy - PUPIL_H / 2 + oy, PUPIL_W, PUPIL_H, 24);
        ctx.fill();
        // catch-light for a little life
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        roundRect(ctx, cx - PUPIL_W / 2 + ox + 12, cy - PUPIL_H / 2 + oy + 11, 17, 19, 8);
        ctx.fill();
      }
    }
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

  useFrame((state) => {
    const g = gfx.current;
    if (!g) return;

    // Bind the OLED texture to the screen material once it exists.
    if (screenMat.current && screenMat.current.map !== g.texture) {
      screenMat.current.map = g.texture;
      screenMat.current.needsUpdate = true;
    }

    // Scroll-linked rotation — same lerp-toward-target pattern as the siblings.
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-26, 20, progress));
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }

    // Eyes: ease pupils toward the cursor while inside; back to centre when out.
    const p = pointer?.current;
    const tx = p?.inside ? p.x : 0;
    const ty = p?.inside ? p.y : 0;
    pupil.current.x = THREE.MathUtils.lerp(pupil.current.x, tx, 0.12);
    pupil.current.y = THREE.MathUtils.lerp(pupil.current.y, ty, 0.12);

    // Occasional blink (triangular open→closed→open).
    const t = state.clock.elapsedTime % BLINK_PERIOD;
    const half = BLINK_DUR / 2;
    const blink = t < half ? t / half : t < BLINK_DUR ? (BLINK_DUR - t) / half : 0;

    draw(g.ctx, g.texture, pupil.current.x, pupil.current.y, blink);

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
