"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { useFitClamp, worstCaseHalfExtents } from "./useFitClamp";

const MODEL = "/corelink.glb";
const AIR_MODEL = "/airmodule.glb";
const LIGHT_MODEL = "/lightmodule.glb";
// The section's pale-purple theme. Lightness is matched to AuraEyez's amber
// knobs (#FFB627 ≈ HSL 40°/100%/58%, perceived luma ≈ 0.73): a violet at
// that raw HSL lightness reads dark because blue carries so little luma, so
// the accent sits at HSL 255°/92%/76% (luma ≈ 0.60) — the same "light and
// bright relative to its own hue" weight, expressed as a pale purple.
const ACCENT = "#A78BFA";
const ACCENT_RGB = "167, 139, 250";
const ENERGY = "#C9B8FF"; // link pulses/arcs: lifted toward white, reads over the ambient glow
const TARGET_WIDTH = 1.5; // world units the hub's footprint is scaled to fill

// The GLB lies on its back: the interface face (knobs, domes, screen inlay)
// points +Y and the knob edge points +Z. UPRIGHT rotates +90° about X so the
// face looks at the camera and the knob edge becomes the flat resting base —
// the wall/desk-panel posture the enclosure was designed for.
const UPRIGHT = Math.PI / 2;
const TILT_X = 0.08; // slight downward presentation tilt (upright device)

// --- companion submodules (secondary supporting cast) ---
// Both share the same 59.5×76×25.6mm enclosure. In the GLB the lid faces +Z
// with the box standing on its 59.5×76 footprint; FLAT lays it down on that
// footprint with the lid (violet cap, finger-notch tab) facing up — the
// resting pose from the product reference. They flank the hub smaller and
// slightly behind, turned a touch inward, and simply ride the shared scroll
// yaw. Their palette is re-themed at runtime (see the traversal below):
// the hub's light body tone on the shell, mid-grey inner, the section's
// pale purple concentrated on the lid.
const FLAT = -Math.PI / 2;
const MOD_SCALE = 6.0; // vs the hub's ~13.5 — clearly subordinate
const MOD_X = 0.95; // flanking offset from the hub's centre
const MOD_Z = -0.26; // parked slightly behind the hub's face plane
const MOD_YAW = 0.3; // gentle turn toward the hub

// --- one-time "link-up" entrance (per session) ---
// The network coming online: the hub boots first (rings sweep up, dome
// indicators warm on), then a glowing pulse travels along a thin arc to each
// submodule in turn — air first, then light — and each answers with a floor
// glow that settles into a faint ambient breath. Once both are linked the
// bright arcs die down to barely-there idle links: two distinct hub-to-node
// threads, not a shared ring — the dramatic pulse is an entrance-only event.
const LINK_KEY = "hx_corelink_link"; // sessionStorage flag (new choreography)
const LINK_TRIGGER = 0.15; // section progress at which the sequence starts
const BOOT_S = 0.55; // hub screen count-up (step 2)
const LED_RAMP = [0.15, 0.55] as const; // dome indicators warm on with the boot
// Each pulse's travel along its arc is a damped spring — the same integrator
// family as the site's other entrance physics (keycap assembly, buggy
// suspension, drone hover): released from rest it genuinely accelerates,
// then decelerates into arrival. ζ≈1 (critical) so it lands without
// overshooting past the lid. Arrival at ~98.5% settle takes ≈0.65s, so the
// second release leaves a clear ~0.3s beat after the first pulse lands.
const PULSE_RELEASE = [0.55, 1.5] as const; // hub -> air, then hub -> light
const PULSE_K = 90; // same stiffness as the keycap-assembly spring
const PULSE_C = 19; // ζ≈1 — decisive arrival, no overshoot
const PULSE_ARRIVED = 0.985; // settle fraction that counts as "landed"
const ACK_FLASH = 0.55; // acknowledgment glow peak opacity
const ACK_TAU = 0.16; // exponential flash decay constant (light dying, not a linear ramp)
const LINES_FADE = [2.3, 2.75] as const; // arcs settle once both are linked
const DONE_T = 2.85;
const PULSE_OPACITY = 0.85; // arc brightness while a pulse is in flight
const IDLE_LINE = 0.09; // settled links: thin, barely-there threads
const TUBE_SEGS = 32; // arc tube segments; drawRange animates in these units
const TUBE_RADIAL = 12; // radial segments — smooth fresnel falloff around the tube
const TUBE_IDX_PER_SEG = TUBE_RADIAL * 6; // radial * 2 triangles * 3 indices
// --- idle: LED breathing on a slow loop ---
const IDLE_PERIOD = 5;
const IDLE_DUR = 1.8;
// submodule ambient breath — much dimmer than the entrance flash
const AMBIENT_BASE = 0.05;
const AMBIENT_AMP = 0.035;

const LED_DIM = 0.1; // dormant indicator emissive
const LED_ON = 1.3; // steady "active" emissive — dimmed per the exposure discipline

// --- live screen readout (Component6 = the 57×30mm display inlay) ---
// Two activity-ring indicators (Apple-Watch style): each metric is an arc
// filled proportionally against its range, with the numeral in the ring's
// centre. Number and arc derive from the same live value, so the boot
// count-up and the idle drift animate both together by construction.
const SCREEN_MESH = "Component6";
const TEX_W = 512;
const TEX_H = 256;
const TEMP_REST = 24.6; // °C
const HUM_REST = 58; // %
const TEMP_RANGE = [15, 35] as const; // indoor range the temp ring spans
const HUM_RANGE = [0, 100] as const; // humidity is already a percentage
const DRIFT_EVERY = [3.5, 5]; // seconds between drift retargets
const TEMP_JITTER = 0.3; // ±°C drift envelope
const HUM_JITTER = 2; // ±% drift envelope
const RING_R = 62; // ring radius, canvas px
const RING_W = 13; // ring stroke width

function linkPlayed() {
  try {
    return sessionStorage.getItem(LINK_KEY) === "1";
  } catch {
    return false;
  }
}

function markLinkPlayed() {
  try {
    sessionStorage.setItem(LINK_KEY, "1");
  } catch {
    /* private mode — fall back to replaying, harmless */
  }
}

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => p * p * (3 - 2 * p);

// Product-line CMF, coordinated with AuraEyez: the same light neutral-grey
// body (#AEAEB2 — AuraEyez's shell tone) across the hub and both submodules,
// dark window elements framing the display (AuraEyez's dark-bezel-on-light-
// body move), and the pale purple concentrated at the technology points —
// knobs, lids, indicator domes/slivers, screen rings, link pulses.
// Env exposure lives on scene.environmentIntensity in useFrame — in this
// three version material.envMapIntensity no longer applies to a
// scene.environment map, so per-material env tweaks would be silently inert.
const matte = (color: string, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });

const BODY_MAT = matte("#AEAEB2", 0.72); // light shell — AuraEyez's body tone
const CAP_MAT = matte("#A6A6AB", 0.68); // front fascia, a half-step down for depth
const PCB_MAT = matte("#234230", 0.6); // interior board, barely visible
const INLAY_MAT = matte("#101215", 0.5); // near-black screen window
const MODULE_MAT = matte("#232327", 0.55); // dark screen surround on the light body
// knobs: the accent made physical — pale-purple machined discs with the same
// jewel treatment as AuraEyez's amber knobs (metalness catches the env map
// so they read as polished metal rather than flat matte plastic)
const KNOB_MAT = new THREE.MeshStandardMaterial({
  color: ACCENT,
  metalness: 0.45,
  roughness: 0.3,
});
// knob-top domes + their tiny indicator slivers: emissive driven at runtime
const DOME_MAT = new THREE.MeshStandardMaterial({
  color: "#4A4260",
  roughness: 0.4,
  metalness: 0,
  emissive: ACCENT,
  emissiveIntensity: LED_DIM,
});
const LED_MAT = new THREE.MeshStandardMaterial({
  color: "#1B1D22",
  roughness: 0.4,
  metalness: 0,
  emissive: ACCENT,
  emissiveIntensity: LED_DIM,
});

// Submodule recolor — the GLBs bake a near-black shell (#2E333B body,
// #1B1E20 inner) that vanishes against the section background, so the real
// palette is applied at runtime: the hub's light body tone on the shells,
// a mid-grey inner tray for depth, the pale purple on the lids.
const MOD_BODY_COLOR = "#AEAEB2";
const MOD_INNER_COLOR = "#77777D";
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
 * The CoreLink smart-home hub — the real CAD assembly (STEP → GLB), standing
 * upright on its flat base, flanked by its two companion submodules (air +
 * light) lying flat with their pale-purple caps facing up.
 *  - One-time entrance per session: the hub boots (activity rings sweep up
 *    with the count, domes warm on), then a glowing pulse arcs from the hub
 *    to each submodule in turn; each answers with a floor-glow
 *    acknowledgment, and once both are linked the bright arcs settle into
 *    barely-there idle threads — the mesh network is established.
 *  - Idle: two faint hub-to-node link threads, a gentle indicator breath, a
 *    subtle sensor drift animating each ring + numeral together, and a much
 *    fainter ambient breath under each submodule. No cursor interaction.
 *  - Shares the sections' scroll-scrub yaw; nothing ever travels.
 */
export default function PulseModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const linesGroup = useRef<THREE.Group>(null); // link arcs attach here on frame 1
  const dot = useRef<THREE.Mesh>(null);
  const halos = useRef<(THREE.Mesh | null)[]>([null, null]);
  const screenMat = useRef<THREE.MeshBasicMaterial>(null);

  // one-time session decision: an already-played (or reduced-motion) visit
  // starts fully settled — no boot, no pulses, live readout from frame one
  const [skipped] = useState(() => linkPlayed() || prefersReducedMotion());

  const link = useRef<{ phase: "waiting" | "running" | "done"; t: number; idle: number }>({
    phase: skipped ? "done" : "waiting",
    t: 0,
    idle: 0,
  });
  const ackFlash = useRef([0, 0]); // per-submodule acknowledgment flash level
  const ackFired = useRef([false, false]); // each submodule acknowledges once
  // per-pulse spring state along its arc: s 0 (at hub) -> 1 (at the lid)
  const pulses = useRef([
    { s: 0, v: 0 },
    { s: 0, v: 0 },
  ]);

  // display state: off until the hub boots, counts to rest, then drifts.
  // `drawnKey` gates canvas redraws to actual value changes.
  const screen = useRef<{
    mode: "off" | "boot" | "live";
    t: number;
    temp: number;
    hum: number;
    tTemp: number;
    tHum: number;
    nextDrift: number;
    drawnKey: string;
  }>({
    mode: skipped ? "live" : "off",
    t: 0,
    temp: skipped ? TEMP_REST : 0,
    hum: skipped ? HUM_REST : 0,
    tTemp: TEMP_REST,
    tHum: HUM_REST,
    nextDrift: 0,
    drawnKey: "",
  });

  const { scene } = useGLTF(MODEL);
  const { scene: airScene } = useGLTF(AIR_MODEL);
  const { scene: lightScene } = useGLTF(LIGHT_MODEL);

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

    // Upright, the GLB's z-extent becomes the standing height, so the floor
    // (rings, submodules, ack glows) sits at -z/2 below the hub's centre.
    const baseY = -(size.z / 2) * scale;

    // The display inlay, measured in the GLB frame: the readout plane sits a
    // hair proud of its outer (+y) surface and inherits the upright wrapper.
    const screenMesh = scene.getObjectByName(SCREEN_MESH);
    const sBox = relBox(screenMesh ?? scene, inv);
    const sCenter = sBox.getCenter(new THREE.Vector3());
    const sSize = sBox.getSize(new THREE.Vector3());

    // Submodules are KHR-quantized: world matrices must be current before
    // measuring, or the boxes come back in raw quantized units.
    airScene.updateWorldMatrix(true, true);
    const modInv = new THREE.Matrix4().copy(airScene.matrixWorld).invert();
    const modSize = relBox(airScene, modInv).getSize(new THREE.Vector3()).multiplyScalar(MOD_SCALE);
    // FLAT pose: GLB x stays width, GLB z (lid axis) becomes height, GLB y
    // becomes depth. The modules rest on the same floor as the hub.
    const modY = baseY + modSize.z / 2;

    // Fit-clamp extents: hub swept through tilt/yaw/upright, widened to the
    // submodules' outer reach (their depth swings forward at the yaw extreme).
    const fitHalf = worstCaseHalfExtents(
      size.clone().multiplyScalar(scale),
      (yaw) => [
        new THREE.Euler(TILT_X, 0, 0),
        new THREE.Euler(0, yaw, 0),
        new THREE.Euler(UPRIGHT, 0, 0),
      ],
      [-22, 0, 18]
    );
    const yawMax = THREE.MathUtils.degToRad(22);
    const modReach =
      (MOD_X + modSize.x / 2) * Math.cos(yawMax) +
      (Math.abs(MOD_Z) + modSize.y / 2) * Math.sin(yawMax);
    fitHalf.w = Math.max(fitHalf.w, modReach);
    fitHalf.h += 0.05; // tilt-group y offset

    // link-pulse arcs: hub's lower face out to each lid's centre. The anchor
    // is measured, not guessed: upright, the GLB's y-thickness faces the
    // camera as world z, so starting just proud of that surface keeps the
    // tube from being born inside the enclosure and popping out through the
    // fascia like a clipping error.
    const hubHalfDepth = (size.y / 2) * scale;
    const hubAnchor = new THREE.Vector3(0, baseY * 0.45, hubHalfDepth + 0.02);
    const lidY = modY + modSize.z / 2 + 0.02;
    const arcs = [-1, 1].map((side) => {
      const end = new THREE.Vector3(side * MOD_X * 0.96, lidY, MOD_Z + 0.06);
      const mid = hubAnchor.clone().lerp(end, 0.5);
      mid.y += 0.34;
      mid.z += 0.1;
      return new THREE.QuadraticBezierCurve3(hubAnchor, mid, end);
    });

    return {
      center,
      scale,
      fitHalf,
      baseY,
      modY,
      modFootprint: Math.max(modSize.x, modSize.y),
      arcs,
      screenPos: [sCenter.x, sBox.max.y + 0.0006, sCenter.z] as [number, number, number],
      screenSize: [sSize.x * 0.94, sSize.z * 0.88] as [number, number],
    };
  }, [scene, airScene]);

  // Submodule scenes: hover raycasts off (no cursor interaction by design),
  // and the baked near-black palette re-themed to the light body + the
  // pale-purple lid (idempotent on the cached scenes).
  useMemo(() => {
    for (const s of [airScene, lightScene]) {
      s.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.raycast = () => {};
        const std = mesh.material as THREE.MeshStandardMaterial;
        if (!std?.isMeshStandardMaterial) return;
        if (std.name === "module_body") {
          std.color.set(MOD_BODY_COLOR);
          std.roughness = 0.68;
        } else if (std.name === "module_inner") {
          std.color.set(MOD_INNER_COLOR);
        } else if (std.name === "module_lid") {
          std.color.set(ACCENT);
          std.roughness = 0.48;
          std.metalness = 0.2;
          // a whisper of self-glow keeps the lid's purple from greying out
          // under the white key light — it stays the accent surface
          std.emissive.set(ACCENT);
          std.emissiveIntensity = 0.12;
        }
      });
    }
  }, [airScene, lightScene]);

  const fitGroup = useFitClamp(layout.fitHalf.w, layout.fitHalf.h);

  // Procedural room environment (no assets), scoped to this Canvas — same
  // approach as AuraEyez: punctual lights alone leave camera-facing surfaces
  // (and the jewel knobs) unlit; the env map gives every surface coverage so
  // form shading survives against the section's glow. Intensity lives on
  // scene.environmentIntensity in useFrame.
  const gl = useThree((s) => s.gl);
  const envTex = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);

  // ---- lazily-built link/glow scenography (mutable, render-persistent):
  // two sampled arc tubes, plus a shared radial halo texture for the
  // acknowledgment floor glows. Built once from the measured layout.
  // Each tube carries a fresnel-falloff shader — brightest along the core
  // where the surface faces the camera, dissolving to nothing at the
  // silhouette — so the link reads as a rendered beam of light with soft
  // gradient edges, not a uniform-opacity stroke.
  const fx = useRef<{
    lines: THREE.Mesh[];
    lineMats: THREE.ShaderMaterial[];
    haloTex: THREE.CanvasTexture;
  } | null>(null);
  if (fx.current == null) {
    const lines: THREE.Mesh[] = [];
    const lineMats: THREE.ShaderMaterial[] = [];
    for (const arc of layout.arcs) {
      // a slim tube reads at every resolution where a 1px GL line vanishes
      const geo = new THREE.TubeGeometry(arc, TUBE_SEGS, 0.03, TUBE_RADIAL, false);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(ENERGY) },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalMatrix * normal;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            // bright core -> transparent silhouette (soft gradient edge)
            float core = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.8);
            gl_FragColor = vec4(uColor, uOpacity * core);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Mesh(geo, mat);
      line.geometry.setDrawRange(0, 0);
      line.raycast = () => {};
      // Transparent objects sort by object origin, and a tube spanning the
      // whole scene has a meaningless single sort point — pin the draw order
      // explicitly instead (floor glows < screen < arcs < dot). Depth-testing
      // stays on, so the arc still passes correctly behind/in front of the
      // opaque models per actual 3D depth as the scene rotates.
      line.renderOrder = 3;
      lines.push(line);
      lineMats.push(mat);
    }
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const cctx = c.getContext("2d")!;
    const g = cctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${ACCENT_RGB}, 0.9)`);
    g.addColorStop(0.45, `rgba(${ACCENT_RGB}, 0.35)`);
    g.addColorStop(1, `rgba(${ACCENT_RGB}, 0)`);
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(c);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    fx.current = { lines, lineMats, haloTex };
  }

  // ---- screen canvas: lives in a ref (mutable, render-persistent), lazily
  // created once. The Canvas only mounts in the browser, so `document` is
  // always available here.
  const gfx = useRef<{
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
    font: string;
  } | null>(null);
  if (gfx.current == null) {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const font =
      getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
      "monospace";
    gfx.current = { ctx, texture, font };
  }

  const drawScreen = (temp: number, hum: number, on: boolean) => {
    const g = gfx.current;
    if (!g) return;
    const key = on ? `${temp.toFixed(1)}|${Math.round(hum)}` : "off";
    const scr = screen.current;
    if (key === scr.drawnKey) return;
    scr.drawnKey = key;

    const { ctx, texture, font } = g;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    if (on) {
      // dark live panel with a pale-purple bezel line — the accent frame
      ctx.fillStyle = "rgba(9, 10, 14, 0.94)";
      ctx.fillRect(0, 0, TEX_W, TEX_H);
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.35)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(7, 7, TEX_W - 14, TEX_H - 14);

      const rings = [
        { cx: TEX_W * 0.27, label: "T E M P", value: temp.toFixed(1), unit: "°C", range: TEMP_RANGE },
        { cx: TEX_W * 0.73, label: "H U M I D I T Y", value: `${Math.round(hum)}`, unit: "%", range: HUM_RANGE },
      ] as const;
      const cy = TEX_H * 0.58;
      const raw = [temp, hum];
      ctx.textAlign = "center";
      ctx.lineCap = "round";
      rings.forEach((r, i) => {
        ctx.font = `500 22px ${font}`;
        ctx.fillStyle = "#7E8390";
        ctx.fillText(r.label, r.cx, 34);

        // dim unfilled track under the progress arc (activity-ring idiom)
        ctx.lineWidth = RING_W;
        ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.14)`;
        ctx.beginPath();
        ctx.arc(r.cx, cy, RING_R, 0, Math.PI * 2);
        ctx.stroke();

        // filled arc from 12 o'clock, proportional to the value in-range,
        // with a soft accent glow so it reads as a lit indicator
        const frac = THREE.MathUtils.clamp(
          (raw[i] - r.range[0]) / (r.range[1] - r.range[0]),
          0,
          1
        );
        if (frac > 0.002) {
          ctx.strokeStyle = ACCENT;
          ctx.shadowColor = `rgba(${ACCENT_RGB}, 0.8)`;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(r.cx, cy, RING_R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // numeral in the ring's centre, unit tucked beneath
        ctx.fillStyle = "#E9E2FF";
        ctx.font = `600 44px ${font}`;
        ctx.fillText(r.value, r.cx, cy + 8);
        ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.75)`;
        ctx.font = `500 21px ${font}`;
        ctx.fillText(r.unit, r.cx, cy + 38);
      });
    }
    texture.needsUpdate = true;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1); // resume-safe (paused frameloop)

    // Env exposure (see the envTex note). AuraEyez runs its light body at
    // the default scene intensity of 1 — matching it here is what makes the
    // shared #AEAEB2 shells render as the same tone in both sections.
    state.scene.environmentIntensity = 1;

    // Scroll-linked rotation — same lerp-toward-target pattern as the siblings.
    if (group.current) {
      const targetY = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-22, 18, progress));
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, 0.08);
    }

    // attach the lazily-built link arcs once (JSX must not read the ref)
    if (linesGroup.current && fx.current && linesGroup.current.children.length === 0) {
      linesGroup.current.add(...fx.current.lines);
    }

    if (screenMat.current && gfx.current && screenMat.current.map !== gfx.current.texture) {
      screenMat.current.map = gfx.current.texture;
      screenMat.current.needsUpdate = true;
    }
    for (const h of halos.current) {
      const m = h?.material as THREE.MeshBasicMaterial | undefined;
      if (h && fx.current && m && m.map !== fx.current.haloTex) {
        m.map = fx.current.haloTex;
        m.needsUpdate = true;
      }
    }

    const l = link.current;
    const t = state.clock.elapsedTime;
    let led = LED_DIM;

    // ---- one-time link-up choreography ----
    if (l.phase === "waiting" && progress >= LINK_TRIGGER) {
      l.phase = "running";
      l.t = 0;
    }
    if (l.phase === "running") {
      // Fixed sub-steps keep the pulse springs identical on every framerate —
      // the same integration discipline as the keycap-assembly entrance.
      let remaining = dt;
      while (remaining > 0) {
        const h = Math.min(remaining, 1 / 120);
        remaining -= h;
        l.t += h;
        pulses.current.forEach((sp, i) => {
          if (l.t <= PULSE_RELEASE[i] || ackFired.current[i]) return;
          sp.v += (PULSE_K * (1 - sp.s) - PULSE_C * sp.v) * h;
          sp.s += sp.v * h;
        });
      }
      // step 2: the hub wakes — indicators warm on with the screen boot
      led =
        LED_DIM +
        (LED_ON - LED_DIM) *
          THREE.MathUtils.clamp((l.t - LED_RAMP[0]) / (LED_RAMP[1] - LED_RAMP[0]), 0, 1);

      // steps 3+4: each pulse springs from the hub to its submodule —
      // accelerating out, decelerating into the lid — and arrival flashes it
      let dotPlaced = false;
      pulses.current.forEach((sp, i) => {
        const line = fx.current?.lines[i];
        const mat = fx.current?.lineMats[i];
        if (!line || !mat || l.t <= PULSE_RELEASE[i]) return;
        if (ackFired.current[i]) return; // landed — full arc stays until the fade
        const p = THREE.MathUtils.clamp(sp.s, 0, 1);
        if (sp.s >= PULSE_ARRIVED) {
          line.geometry.setDrawRange(0, TUBE_SEGS * TUBE_IDX_PER_SEG);
          ackFired.current[i] = true; // acknowledge exactly once
          ackFlash.current[i] = 1;
        } else {
          line.geometry.setDrawRange(0, Math.ceil(p * TUBE_SEGS) * TUBE_IDX_PER_SEG);
          mat.uniforms.uOpacity.value = PULSE_OPACITY;
          if (dot.current && !dotPlaced) {
            dotPlaced = true;
            dot.current.visible = true;
            dot.current.position.copy(layout.arcs[i].getPoint(p));
            dot.current.scale.setScalar(1 + 0.25 * Math.sin(t * 14));
          }
        }
      });
      if (!dotPlaced && dot.current) dot.current.visible = false;

      // step 5: both linked — the bright arcs settle to the idle threads
      // (eased, not a linear cut)
      const fade = easeInOut(
        THREE.MathUtils.clamp((l.t - LINES_FADE[0]) / (LINES_FADE[1] - LINES_FADE[0]), 0, 1)
      );
      if (l.t >= LINES_FADE[0] && fx.current) {
        for (const m of fx.current.lineMats)
          m.uniforms.uOpacity.value = THREE.MathUtils.lerp(PULSE_OPACITY, IDLE_LINE, fade);
      }
      if (l.t >= DONE_T) {
        l.phase = "done";
        if (dot.current) dot.current.visible = false;
        markLinkPlayed();
      }
    } else if (l.phase === "done") {
      // idle: the links persist as barely-there threads (an already-played
      // session lands here on frame one, so the settled state is asserted,
      // not just inherited from the fade), LEDs breathing on a slow loop
      if (fx.current) {
        for (const line of fx.current.lines)
          line.geometry.setDrawRange(0, TUBE_SEGS * TUBE_IDX_PER_SEG);
        for (const m of fx.current.lineMats) m.uniforms.uOpacity.value = IDLE_LINE;
      }
      l.idle += dt;
      const ip = (l.idle % IDLE_PERIOD) / IDLE_DUR;
      led = LED_ON + (ip < 1 ? 0.25 * Math.sin(Math.PI * ip) : 0);
    }
    DOME_MAT.emissiveIntensity = led * 0.3; // domes glow softer than slivers
    LED_MAT.emissiveIntensity = led;

    // ---- acknowledgment glows: flash on arrival, settle to a faint breath
    halos.current.forEach((h, i) => {
      if (!h) return;
      const m = h.material as THREE.MeshBasicMaterial;
      // exponential decay — a flash of light dying away, not a linear ramp
      ackFlash.current[i] *= Math.exp(-dt / ACK_TAU);
      const settled = l.phase === "done" || ackFired.current[i];
      const ambient = settled ? AMBIENT_BASE + AMBIENT_AMP * Math.sin(t * 0.8 + i * 2.4) : 0;
      m.opacity = Math.min(0.7, ambient + ackFlash.current[i] * ACK_FLASH);
    });

    // ---- live display ----
    const scr = screen.current;
    if (scr.mode === "off") {
      if (l.phase !== "waiting") {
        scr.mode = "boot";
        scr.t = 0;
      }
      drawScreen(0, 0, false);
    } else if (scr.mode === "boot") {
      scr.t += dt;
      const p = Math.min(1, scr.t / BOOT_S);
      // count up from the ring's floor so the numeral and its arc sweep rise
      // together from the first frame (a 0°C start would leave the temp ring
      // empty for the first 15 degrees of the count)
      scr.temp = TEMP_RANGE[0] + (TEMP_REST - TEMP_RANGE[0]) * easeOutCubic(p);
      scr.hum = HUM_REST * easeOutCubic(p);
      if (p >= 1) {
        scr.mode = "live";
        scr.nextDrift = t + DRIFT_EVERY[0];
      }
      drawScreen(scr.temp, scr.hum, true);
    } else {
      // live: gentle sensor drift — retarget every few seconds, ease toward
      // the target so tenths tick over naturally (skipped under reduced motion)
      if (!prefersReducedMotion()) {
        if (t >= scr.nextDrift) {
          scr.tTemp = TEMP_REST + (Math.random() * 2 - 1) * TEMP_JITTER;
          scr.tHum = HUM_REST + (Math.random() * 2 - 1) * HUM_JITTER;
          scr.nextDrift = t + DRIFT_EVERY[0] + Math.random() * (DRIFT_EVERY[1] - DRIFT_EVERY[0]);
        }
        scr.temp = THREE.MathUtils.lerp(scr.temp, scr.tTemp, 0.04);
        scr.hum = THREE.MathUtils.lerp(scr.hum, scr.tHum, 0.04);
      }
      drawScreen(scr.temp, scr.hum, true);
    }
  });

  return (
    <>
      <primitive object={envTex} attach="environment" />
      {/* AuraEyez's exposure, so the shared light-body tone matches across
          the two sections */}
      <SceneLights accent={ACCENT} accentIntensity={0.6} level={0.7} ambientScale={0.6} />
      {/* slight downward tilt; scroll rotation inside */}
      <group rotation={[TILT_X, 0, 0]} position={[0, -0.05, 0]}>
        <group ref={group}>
          {/* fit clamp wraps the whole composition — hub, arcs, submodules */}
          <group ref={fitGroup}>
            <group scale={layout.scale}>
              {/* stand the hub upright: face to camera, knob edge to floor */}
              <group rotation={[UPRIGHT, 0, 0]}>
                <group position={[-layout.center.x, -layout.center.y, -layout.center.z]}>
                  <primitive object={scene} />
                  {/* live readout plane, a hair proud of the display inlay */}
                  <mesh position={layout.screenPos} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
                    <planeGeometry args={layout.screenSize} />
                    <meshBasicMaterial
                      ref={screenMat}
                      transparent
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>
                </group>
              </group>
            </group>

            {/* link arcs (bright during the entrance, barely-there at idle)
                + the traveling pulse (entrance only) */}
            <group ref={linesGroup} />
            <mesh ref={dot} visible={false} renderOrder={4}>
              <sphereGeometry args={[0.045, 16, 16]} />
              <meshBasicMaterial
                color={"#F0EAFF"}
                transparent
                opacity={0.95}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
              {/* soft outer glow riding the same position */}
              <mesh scale={2.4} renderOrder={4}>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial
                  color={ENERGY}
                  transparent
                  opacity={0.22}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            </mesh>

            {/* companion submodules — lying flat, violet caps up, flanking
                the hub slightly behind and turned a touch inward */}
            {[
              { modScene: airScene, side: -1 },
              { modScene: lightScene, side: 1 },
            ].map(({ modScene, side }, i) => (
              <group
                key={i}
                position={[side * MOD_X, layout.modY, MOD_Z]}
                rotation={[0, -side * MOD_YAW, 0]}
              >
                <group rotation={[FLAT, 0, 0]} scale={MOD_SCALE}>
                  <primitive object={modScene} />
                </group>
              </group>
            ))}

            {/* acknowledgment floor glows under each submodule */}
            {[-1, 1].map((side, i) => (
              <mesh
                key={i}
                ref={(m) => {
                  halos.current[i] = m;
                }}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[side * MOD_X, layout.baseY - 0.015, MOD_Z]}
                renderOrder={1}
              >
                <planeGeometry args={[layout.modFootprint * 1.9, layout.modFootprint * 1.9]} />
                <meshBasicMaterial
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

// No module-level useGLTF.preload here: the showcase GLBs are warmed in page
// order by ModelPrefetcher during idle time after first paint, instead of
// parallel fetches competing with the initial load.
