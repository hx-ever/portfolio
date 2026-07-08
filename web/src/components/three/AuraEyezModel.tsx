"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import SceneLights from "./SceneLights";
import type { SectionPointer } from "@/lib/useSectionPointer";

const MODEL = "/auraeyez.glb";
const ACCENT = "#F0B24A"; // warm amber — matches the device's knob + section glow
const TARGET_WIDTH = 1.55; // world units the 80mm device face is scaled to fill

// GLB mesh names (GLTFLoader strips the dots from Blender's "Body1.008" etc.)
const KNOB_MESHES: readonly string[] = ["Body1008", "Body1009"]; // left (-x) and right (+x) knob caps
const GLASS_MESH = "Body5002"; // the OLED cover glass — the visible display area
const CAD_AMBER_MATERIAL = "Paint - Enamel Glossy (Yellow)"; // shared by knob caps + backplate

// Device palette. The body shell keeps its ORIGINAL imported color (the CAD's
// near-white ABS); only the knobs and the distinct backplate mesh are themed —
// vivid saturated amber-golds that echo the section's accent.
const PLATE_COLOR = "#F5A50F"; // backplate: saturated amber enamel
const KNOB_COLOR = "#FFAD1F"; // knobs: vivid metallic gold

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

// --- one-time "power-on" entrance (per session, like the hero walk-in) ---
// The device never moves: it sits in place dark, a light sweep crosses the
// body revealing its true materials, the screen double-flickers and the eyes
// fade in, and the section's amber glow blooms up alongside them.
const POWER_KEY = "hx_aura_power_played"; // sessionStorage flag
const POWER_TRIGGER = 0.15; // section progress at which the sequence starts
// Timeline, seconds from trigger:
const T_SWEEP_START = 0.2; // "off" hold before anything changes
const T_SWEEP_END = 0.85; // sweep fully across the body (~0.65s)
const T_FLICK1 = 0.68; // screen boot — as the sweep clears the screen area
const D_FLICK = 0.07; // first flash length (off→on→off→on rhythm)
const T_FLICK2 = 0.82; // second flash, fading out as the panel settles
const D_FLICK2 = 0.18;
const T_EYES = 0.9; // eyes fade/scale in as the flicker settles
const D_EYES = 0.35;
const T_GLOW = 1.1; // ambient bloom, overlapping the eye fade
const D_GLOW = 0.45;
const T_DONE = 1.55; // sweep start → full glow ≈ 1.35s
// Sweep front travel in world-x (device face is ~1.55 wide, centred).
const SWEEP_FROM = -1.2;
const SWEEP_TO = 1.2;

// Shared shader uniform for the sweep front's world-x. Module-level so the
// GLB's cached materials (compiled once, kept across mounts) always read the
// live value: -10 parks everything dark, 10 is fully lit/normal.
const sweepUniform = { value: 10 };

/**
 * Injects the power-on sweep into a standard/physical material (idempotent):
 * fragments left of the sweep front render at their true color, everything
 * ahead of it stays near-black, and a soft emissive band rides the front.
 */
function injectSweep(mat: THREE.MeshStandardMaterial) {
  if (mat.userData.sweepInjected) return;
  mat.userData.sweepInjected = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSweep = sweepUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vSweepX;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSweepX = (modelMatrix * vec4(position, 1.0)).x;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vSweepX;\nuniform float uSweep;"
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float sweepLit = smoothstep(vSweepX - 0.05, vSweepX + 0.3, uSweep);
        diffuseColor.rgb *= mix(0.05, 1.0, sweepLit);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float sweepD = (uSweep - vSweepX) / 0.15;
        totalEmissiveRadiance += vec3(1.0, 0.96, 0.88) * exp(-sweepD * sweepD) * 0.55;`
      );
  };
}

function powerAlreadyPlayed() {
  try {
    return sessionStorage.getItem(POWER_KEY) === "1";
  } catch {
    return false;
  }
}

function markPowerPlayed() {
  try {
    sessionStorage.setItem(POWER_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
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
 *  - on its first scroll into view each session it "powers on" in place: a
 *    light sweep reveals the body, the screen double-flickers and the eyes
 *    fade in, and the section's amber glow blooms up — no motion, only
 *    materials and light;
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

  // Power-on entrance state; skipped entirely when already played this session.
  const power = useRef<{ phase: "waiting" | "running" | "done"; t: number } | null>(null);
  if (power.current == null) {
    power.current = { phase: powerAlreadyPlayed() ? "done" : "waiting", t: 0 };
  }
  // The section's DOM glow element is driven via a CSS variable during the
  // ambient-bloom step; resolved lazily from the canvas' ancestors.
  const sectionEl = useRef<HTMLElement | null>(null);

  const { scene } = useGLTF(MODEL);

  // A procedural room environment (no assets), scoped to this section's own
  // Canvas: it's what makes the graphite knobs read as metal — punctual
  // lights alone leave camera-facing metal faces black. Attached to the
  // scene declaratively below.
  const gl = useThree((s) => s.gl);
  const envTex = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);

  // Measure the CAD assembly once: overall fit, plus where the OLED glass and
  // the two knob caps sit — expressed in the face-to-camera frame (the device
  // face points -Y in the file; the -90° X rotation below turns it to +Z).
  const layout = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();

    // Only the knob caps take part in pointer raycasts — the assembly has 67
    // meshes and hover only cares about the knobs. Idempotent on the cached scene.
    //
    // Materials, re-themed to the site palette: the CAD's amber paint is
    // shared by the knob caps AND the backplate, so the knobs get their own
    // brushed-graphite material (dark, metallic, clearly separated from the
    // light body) while the plate joins the warm-neutral body scheme.
    const knobMat = new THREE.MeshStandardMaterial({
      color: KNOB_COLOR,
      metalness: 0.9,
      roughness: 0.25, // tactile premium metal — tighter highlight
      envMapIntensity: 0.5,
    });
    injectSweep(knobMat);
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (KNOB_MESHES.includes(mesh.name)) {
        mesh.material = knobMat; // stays raycastable for the hover halo
        return;
      }
      mesh.raycast = () => {};
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial || seen.has(std)) continue;
        seen.add(std);
        // The CAD export leaves metallicFactor at the glTF default (1.0), and
        // fully-metallic surfaces render dark without an environment map —
        // these parts are plastic, so kill the metalness. Keep the room-env
        // reflection subtle on the plastics; it's the knobs' effect. The body
        // shell keeps its original imported color.
        std.metalness = 0.05;
        std.envMapIntensity = 0.12;
        if (std.name === CAD_AMBER_MATERIAL) std.color.set(PLATE_COLOR);
        injectSweep(std);
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
  // The canvas is transparent — the GLB's own cover glass is the display
  // background. `eyeAlpha` fades/scales the eyes in during the power-on boot;
  // `flash` paints the boot flicker's white flashes.
  const draw = (
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
    nx: number,
    ny: number,
    blink: number,
    eyeAlpha: number,
    flash: number
  ) => {
    ctx.clearRect(0, 0, TEX_W, TEX_H);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(flash * 0.85).toFixed(3)})`;
      ctx.fillRect(0, 0, TEX_W, TEX_H);
    }

    if (eyeAlpha > 0) {
      const oy = ny * GAZE_RANGE_Y;
      const lid = 1 - blink * 0.92; // eye height factor while blinking
      const grow = easeOutCubic(eyeAlpha); // fade + scale in together

      // Pure white eyes with a soft white halo. The glow is a canvas shadow on
      // the same fill, so it moves and reshapes with each eye (gaze + curiosity).
      ctx.save();
      ctx.globalAlpha = grow;
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = EYE_GLOW;
      ctx.shadowBlur = EYE_GLOW_BLUR * grow;
      for (const side of [-1, 1]) {
        const cx = TEX_W / 2 + side * EYE_GAP + nx * GAZE_RANGE_X;
        const cy = TEX_H / 2 + oy;
        // lean ∈ [0,1]: how far the gaze has moved toward this eye's own side
        const lean = Math.max(0, side * nx);
        const w = EYE_W * grow;
        const h = EYE_H * (1 + CURIOSITY * lean) * lid * grow;

        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, EYE_R * grow);
        ctx.fill();
      }
      ctx.restore();
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

  useFrame((state, delta) => {
    const g = gfx.current;
    if (!g) return;

    // Bind the OLED texture to the screen material once it exists.
    if (screenMat.current && screenMat.current.map !== g.texture) {
      screenMat.current.map = g.texture;
      screenMat.current.needsUpdate = true;
    }

    // Scroll-linked rotation — same lerp-toward-target pattern as the
    // siblings; the model never moves during the power-on, so this runs
    // unconditionally from the very first frame.
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-26, 20, progress));
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }

    // Power-on sequence: off hold → light sweep → screen boot → ambient bloom.
    // Everything is driven by material/light state; position never changes.
    const pw = power.current!;
    if (sectionEl.current == null) {
      sectionEl.current = gl.domElement.closest("section");
      // Park the section's amber glow at zero until the bloom step.
      if (pw.phase !== "done") sectionEl.current?.style.setProperty("--glow-opacity", "0");
    }
    let eyeAlpha = 1;
    let flash = 0;
    if (pw.phase === "waiting") {
      sweepUniform.value = -10; // whole body parked dark
      eyeAlpha = 0;
      if (progress >= POWER_TRIGGER) {
        pw.phase = "running";
        pw.t = 0;
      }
    } else if (pw.phase === "running") {
      pw.t += delta;
      const t = pw.t;
      // light sweep front, world-x
      sweepUniform.value =
        t < T_SWEEP_START
          ? -10
          : t >= T_SWEEP_END
            ? 10
            : THREE.MathUtils.lerp(
                SWEEP_FROM,
                SWEEP_TO,
                (t - T_SWEEP_START) / (T_SWEEP_END - T_SWEEP_START)
              );
      // screen boot: flash → off → flash fading out → eyes fade in
      if (t >= T_FLICK1 && t < T_FLICK1 + D_FLICK) flash = 1;
      else if (t >= T_FLICK2 && t < T_FLICK2 + D_FLICK2)
        flash = 1 - (t - T_FLICK2) / D_FLICK2;
      eyeAlpha = THREE.MathUtils.clamp((t - T_EYES) / D_EYES, 0, 1);
      // ambient bloom, overlapping the eye fade
      const glow01 = THREE.MathUtils.clamp((t - T_GLOW) / D_GLOW, 0, 1);
      sectionEl.current?.style.setProperty("--glow-opacity", glow01.toFixed(3));
      if (t >= T_DONE) {
        pw.phase = "done";
        sweepUniform.value = 10;
        sectionEl.current?.style.setProperty("--glow-opacity", "1");
        markPowerPlayed();
      }
    } else {
      sweepUniform.value = 10; // steady state — fully lit
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

    draw(g.ctx, g.texture, gaze.current.x, gaze.current.y, blink, eyeAlpha, flash);

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
      <primitive object={envTex} attach="environment" />
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

            {/* OLED eyes: transparent canvas plane over the cover glass — the
                GLB's own glass is the display background (texture bound in useFrame) */}
            <mesh position={layout.eye.pos}>
              <planeGeometry args={[layout.eye.w, layout.eye.h]} />
              <meshBasicMaterial ref={screenMat} transparent depthWrite={false} toneMapped={false} />
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
