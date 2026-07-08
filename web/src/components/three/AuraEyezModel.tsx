"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { matteDark } from "./materials";
import SceneLights from "./SceneLights";
import type { SectionPointer } from "@/lib/useSectionPointer";

const ACCENT = "#F0B24A"; // warm amber — matches the device's knob + section glow

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

/** A rotary encoder knob that glows softly amber while hovered. */
function Knob({
  position,
  accent,
}: {
  position: [number, number, number];
  accent: string;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const hovered = useRef(false);
  const glow = useRef(0);

  useFrame(() => {
    // ~180ms ease toward the hovered/rest target (independent of the eyes).
    const target = hovered.current ? 1 : 0;
    glow.current = THREE.MathUtils.lerp(glow.current, target, 0.15);
    const mat = ring.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = glow.current * 0.7;
    if (ring.current) {
      const s = 1 + glow.current * 0.14;
      ring.current.scale.set(s, s, 1);
    }
  });

  return (
    <group position={position}>
      {/* soft glow halo, sits just behind the knob face */}
      <mesh ref={ring} position={[0, 0, -0.015]}>
        <ringGeometry args={[0.135, 0.22, 48]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* knob body — the circular face points at the camera (+Z) */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          hovered.current = true;
        }}
        onPointerOut={() => {
          hovered.current = false;
        }}
      >
        <cylinderGeometry args={[0.12, 0.125, 0.11, 40]} />
        <meshStandardMaterial color="#2b2b30" roughness={0.5} metalness={0.35} />
      </mesh>
      {/* amber position indicator on the knob face */}
      <mesh position={[0, 0.055, 0.058]}>
        <boxGeometry args={[0.02, 0.07, 0.012]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

/**
 * The AuraEyez desk assistant: a matte dark gadget with an OLED panel showing
 * two RoboEyes and two rotary knobs. The eyes track the cursor (eased) while it
 * is inside the section and ease back to centre when it leaves; each knob glows
 * on hover. The whole device rotates with scroll via the shared progress prop,
 * so these interactions layer on top of the existing scroll-scrub system.
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
  const pupil = useRef({ x: 0, y: 0 });

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
  });

  return (
    <>
      <SceneLights accent={ACCENT} accentIntensity={0.6} />
      {/* static tilt for depth; scroll rotation lives on the inner group */}
      <group rotation={[-0.09, 0, 0]} scale={1.05}>
        <group ref={group}>
          {/* body */}
          <mesh>
            <boxGeometry args={[1.5, 1.24, 0.5]} />
            <meshStandardMaterial {...matteDark} />
          </mesh>
          {/* screen bezel */}
          <mesh position={[0, 0.12, 0.251]}>
            <boxGeometry args={[1.28, 0.74, 0.02]} />
            <meshStandardMaterial color="#0a0a0d" roughness={0.4} metalness={0.1} />
          </mesh>
          {/* OLED screen with tracked eyes (texture bound in useFrame) */}
          <mesh position={[0, 0.12, 0.263]}>
            <planeGeometry args={[1.16, 0.62]} />
            <meshBasicMaterial ref={screenMat} toneMapped={false} />
          </mesh>
          {/* knobs */}
          <Knob position={[-0.42, -0.44, 0.25]} accent={ACCENT} />
          <Knob position={[0.42, -0.44, 0.25]} accent={ACCENT} />
        </group>
      </group>
    </>
  );
}
