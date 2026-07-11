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
const ACCENT = "#7A2FFF"; // the section's electric-violet theme — full saturation
const ACCENT_RGB = "122, 47, 255";
const ENERGY = "#AC85FF"; // link pulses/arcs: lifted violet-white, reads over the ambient glow
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
// legible graphite shell, dark inner, the section's electric violet
// concentrated on the lid.
const FLAT = -Math.PI / 2;
const MOD_SCALE = 6.0; // vs the hub's ~13.5 — clearly subordinate
const MOD_X = 0.95; // flanking offset from the hub's centre
const MOD_Z = -0.26; // parked slightly behind the hub's face plane
const MOD_YAW = 0.3; // gentle turn toward the hub

// --- one-time "link-up" entrance (per session) ---
// The network coming online: the hub boots first (screen counts up, dome
// indicators warm on), then a glowing pulse travels along a thin arc to each
// submodule in turn — air first, then light — and each answers with a floor
// glow that settles into a faint ambient breath. Once both are linked the
// arcs fade: the connection is established and doesn't need a visible wire.
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
const LINES_FADE = [2.3, 2.75] as const; // arcs dissolve once both are linked
const DONE_T = 2.85;
const TUBE_SEGS = 32; // arc tube segments; drawRange animates in these units
const TUBE_IDX_PER_SEG = 8 * 6; // radialSegments * 2 triangles * 3 indices
// --- idle: one quiet ring on a slow loop, LED breathing in sync ---
const IDLE_PERIOD = 5;
const IDLE_DUR = 1.8;
// submodule ambient breath — much dimmer than the hub's ring
const AMBIENT_BASE = 0.05;
const AMBIENT_AMP = 0.035;

const LED_DIM = 0.1; // dormant indicator emissive
const LED_ON = 1.3; // steady "active" emissive — dimmed per the exposure discipline

// --- live screen readout (Component6 = the 57×30mm display inlay) ---
const SCREEN_MESH = "Component6";
const TEX_W = 512;
const TEX_H = 256;
const TEMP_REST = 24.6; // °C
const HUM_REST = 58; // %
const DRIFT_EVERY = [3.5, 5]; // seconds between drift retargets
const TEMP_JITTER = 0.3; // ±°C drift envelope
const HUM_JITTER = 2; // ±% drift envelope

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

const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => p * p * (3 - 2 * p);

// Dyson-style redesign: dark-but-legible engineered graphite body, the
// electric violet concentrated at the technology points — the knobs,
// indicator domes/slivers, the screen readout and its bezel, the link pulses
// and rings. The graphite sits high enough above black that form shading
// reads against the section's violet glow (an env map below provides the
// coverage punctual lights alone can't give camera-facing surfaces).
// Env exposure lives on scene.environmentIntensity (ENV_LEVEL below) — in
// this three version material.envMapIntensity no longer applies to a
// scene.environment map, so per-material env tweaks would be silently inert.
const matte = (color: string, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });

const BODY_MAT = matte("#42474F", 0.68); // graphite shell — visible form, not a silhouette
const CAP_MAT = matte("#31353C", 0.64); // darker front fascia, still legible
const PCB_MAT = matte("#234230", 0.6); // interior board, barely visible
const INLAY_MAT = matte("#101215", 0.5); // near-black screen window
const MODULE_MAT = matte("#40454D", 0.66);
// knobs: the accent made physical — jewel-violet machined discs, the same
// treatment as AuraEyez's amber knobs (they catch the env map and read as
// polished metal rather than flat matte plastic)
const KNOB_MAT = new THREE.MeshStandardMaterial({
  color: "#7C34FF",
  metalness: 0.45,
  roughness: 0.3,
});
// knob-top domes + their tiny indicator slivers: emissive driven at runtime
const DOME_MAT = new THREE.MeshStandardMaterial({
  color: "#322B44",
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
// palette is applied at runtime: legible graphite matching the hub, with the
// lid carrying the full-saturation accent as the brightest surface.
const MOD_BODY_COLOR = "#41464E";
const MOD_INNER_COLOR = "#282B31";
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
 * light) lying flat with their violet caps facing up.
 *  - One-time entrance per session: the hub boots (screen counts up, domes
 *    warm on), then a glowing pulse arcs from the hub to each submodule in
 *    turn; each answers with a floor-glow acknowledgment, and once both are
 *    linked the arcs fade — the mesh network is established.
 *  - Idle: one quiet ring on a slow loop under the hub, a gentle indicator
 *    breath, a subtle sensor drift on the display, and a much fainter
 *    ambient breath under each submodule. No bespoke cursor interaction.
 *  - Shares the sections' scroll-scrub yaw; nothing ever travels, and the
 *    ring radius is clamped to the live viewport so nothing ever clips.
 */
export default function PulseModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const linesGroup = useRef<THREE.Group>(null); // link arcs attach here on frame 1
  const ring = useRef<THREE.Mesh>(null);
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
  // and the baked near-black palette re-themed to the legible graphite + the
  // saturated accent lid (idempotent on the cached scenes).
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
          // a whisper of self-glow keeps the lid's violet saturated instead
          // of washing toward lavender under the white key light — it is the
          // brightest element in the hierarchy, and reads as pigment + light
          std.emissive.set(ACCENT);
          std.emissiveIntensity = 0.18;
        }
      });
    }
  }, [airScene, lightScene]);

  const fitGroup = useFitClamp(layout.fitHalf.w, layout.fitHalf.h);

  // Procedural room environment (no assets), scoped to this Canvas — same
  // approach as AuraEyez: punctual lights alone leave the camera-facing dark
  // graphite (and the jewel knobs) unlit; the env map gives every surface
  // coverage so form shading survives against the section's violet glow.
  // Exposure is calibrated live: environmentIntensity 1 washes the graphite
  // to silver, 0 collapses it back to the old silhouette — the dark-but-
  // legible target sits in between.
  const gl = useThree((s) => s.gl);
  const envTex = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);

  // ---- lazily-built link/glow scenography (mutable, render-persistent):
  // two sampled arc lines, plus a shared radial halo texture for the
  // acknowledgment floor glows. Built once from the measured layout.
  const fx = useRef<{
    lines: THREE.Mesh[];
    lineMats: THREE.MeshBasicMaterial[];
    haloTex: THREE.CanvasTexture;
  } | null>(null);
  if (fx.current == null) {
    const lines: THREE.Mesh[] = [];
    const lineMats: THREE.MeshBasicMaterial[] = [];
    for (const arc of layout.arcs) {
      // a slim tube reads at every resolution where a 1px GL line vanishes
      const geo = new THREE.TubeGeometry(arc, TUBE_SEGS, 0.026, 8, false);
      const mat = new THREE.MeshBasicMaterial({
        color: ENERGY,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
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
      // dark live panel with a violet bezel line — the accent frame
      ctx.fillStyle = "rgba(9, 10, 14, 0.94)";
      ctx.fillRect(0, 0, TEX_W, TEX_H);
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.4)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(7, 7, TEX_W - 14, TEX_H - 14);
      ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
      ctx.fillRect(TEX_W / 2, 44, 1, TEX_H - 88);

      ctx.textAlign = "center";
      ctx.fillStyle = "#7E8390";
      ctx.font = `500 26px ${font}`;
      ctx.fillText("T E M P", TEX_W * 0.25, 76);
      ctx.fillText("H U M I D I T Y", TEX_W * 0.75, 76);

      // the accent, lifted a step for legibility: #A05CFF on the near-black
      // panel is ~5.4:1 contrast — comfortably readable at full saturation
      ctx.fillStyle = "#A05CFF";
      ctx.shadowColor = `rgba(${ACCENT_RGB}, 0.7)`;
      ctx.shadowBlur = 18;
      ctx.font = `600 84px ${font}`;
      ctx.fillText(temp.toFixed(1), TEX_W * 0.25 - 22, 182);
      ctx.fillText(`${Math.round(hum)}`, TEX_W * 0.75 - 26, 182);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#7B5BC9";
      ctx.font = `500 34px ${font}`;
      ctx.fillText("°C", TEX_W * 0.25 + 82, 156);
      ctx.fillText("%", TEX_W * 0.75 + 74, 156);
    }
    texture.needsUpdate = true;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1); // resume-safe (paused frameloop)

    // Env exposure (see the envTex note): 1 washes the graphite to silver,
    // 0 collapses it to a silhouette — 0.38 is the dark-but-legible target.
    state.scene.environmentIntensity = 0.38;

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
          mat.opacity = 0.85;
          if (dot.current && !dotPlaced) {
            dotPlaced = true;
            dot.current.visible = true;
            dot.current.position.copy(layout.arcs[i].getPoint(p));
            dot.current.scale.setScalar(1 + 0.25 * Math.sin(t * 14));
          }
        }
      });
      if (!dotPlaced && dot.current) dot.current.visible = false;

      // step 5: both linked — the arcs dissolve (eased, not a linear cut)
      const fade =
        1 -
        easeInOut(
          THREE.MathUtils.clamp((l.t - LINES_FADE[0]) / (LINES_FADE[1] - LINES_FADE[0]), 0, 1)
        );
      if (l.t >= LINES_FADE[0] && fx.current) {
        for (const m of fx.current.lineMats) m.opacity = 0.85 * fade;
      }
      if (l.t >= DONE_T) {
        l.phase = "done";
        if (dot.current) dot.current.visible = false;
        if (fx.current) for (const m of fx.current.lineMats) m.opacity = 0;
        markLinkPlayed();
      }
    } else if (l.phase === "done") {
      // idle: one quiet ring on a slow loop under the hub, LEDs breathing
      l.idle += dt;
      const ip = (l.idle % IDLE_PERIOD) / IDLE_DUR;
      led = LED_ON + (ip < 1 ? 0.25 * Math.sin(Math.PI * ip) : 0);
      if (ring.current) {
        const mat = ring.current.material as THREE.MeshBasicMaterial;
        const maxR = Math.min(1.25, (state.viewport.width / 2) * 0.92);
        if (ip > 0 && ip < 1) {
          ring.current.scale.setScalar(0.35 + (maxR - 0.35) * easeOutQuad(ip));
          mat.opacity = 0.34 * Math.sin(Math.PI * ip);
        } else {
          mat.opacity = 0;
        }
      }
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
      scr.temp = TEMP_REST * easeOutCubic(p);
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
      <SceneLights accent={ACCENT} accentIntensity={0.75} level={0.95} ambientScale={0.7} />
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

            {/* idle pulse ring, flat on the floor under the hub's centre */}
            <mesh
              ref={ring}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, layout.baseY - 0.02, 0]}
              renderOrder={1}
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

            {/* link arcs + traveling pulse (entrance only) */}
            <group ref={linesGroup} />
            <mesh ref={dot} visible={false} renderOrder={4}>
              <sphereGeometry args={[0.045, 16, 16]} />
              <meshBasicMaterial
                color={"#E4D8FF"}
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
                  color={"#AC85FF"}
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
