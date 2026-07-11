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
// footprint with the lid (violet cap, finger-notch tab) facing up. Their
// palette is re-themed at runtime: the hub's light body tone on the shell,
// mid-grey inner, the section's pale purple on the lid.
//
// They flank the hub at deliberately DIFFERENT distances (air nearer + a
// touch forward, light farther + a touch back) so the broadcast ripple
// reaches them at physically distinct moments — the acknowledgment stagger
// is a consequence of real geometry, not a hand-tuned delay.
const FLAT = -Math.PI / 2;
const MOD_SCALE = 6.0; // vs the hub's ~13.5 — clearly subordinate
const MOD_YAW = 0.3; // gentle turn toward the hub
const MODS = [
  { x: -0.91, z: -0.12 }, // air — left, nearer   (dist ≈ 0.918)
  { x: 0.97, z: -0.42 }, // light — right, farther (dist ≈ 1.057)
] as const;

// --- one-time "link-up" entrance (per session) ---
// The network coming online: the hub boots (screen powers to a "LINKING"
// state, dome indicators warm on), then broadcasts — concentric ripple rings
// expand outward from the hub across the floor, like a radar pulse. As each
// ripple's front reaches a submodule's real position, that submodule's lid
// flashes in the accent (the signal arriving). Once BOTH have acknowledged,
// the connection is established: the live sensor dashboard boots on-screen,
// the ripples finish dissipating, and the scene settles — nothing persists at
// rest, no line/arc/ring is ever drawn between the objects.
const LINK_KEY = "hx_corelink_link"; // sessionStorage flag
const LINK_TRIGGER = 0.15; // section progress at which the sequence starts
const LED_RAMP = [0.15, 0.55] as const; // dome indicators warm on with the boot
// Broadcast ripples: 3 concentric rings on a short staggered "scanning burst".
const RIPPLE_COUNT = 3;
const RIPPLE_START = 0.35; // brief boot beat before the first broadcast
const RIPPLE_STAGGER = 0.34; // gap between successive rings
const RIPPLE_DUR = 1.7; // one ring's lifetime: birth → expanded → faded
const RIPPLE_MAX_R = 1.45; // final radius — clears the farther module (~1.06)
const RIPPLE_PEAK = 0.5; // ring opacity at birth (additive)
// Acknowledgment: the lid brightens the instant the ripple front crosses it.
const LID_BASE = 0.12; // resting lid self-glow (matches the material author)
const ACK_BOOST = 1.15; // extra lid emissive at the moment the ripple lands
const ACK_TAU = 0.3; // exponential decay of the acknowledgment flash
// Dashboard boot (fires only after BOTH modules acknowledge).
const BOOT_S = 0.6; // ring-fill + count-up duration
const DONE_T = 2.9; // all rings faded + dashboard booted → settle to idle
// --- idle: LED breathing on a slow loop ---
const IDLE_PERIOD = 5;
const IDLE_DUR = 1.8;

const LED_DIM = 0.1; // dormant indicator emissive
const LED_ON = 1.3; // steady "active" emissive — dimmed per the exposure discipline

// --- live screen readout (Component6 = the 57×30mm display inlay) ---
// Two activity-ring indicators (Apple-Watch style): each metric is an arc
// filled proportionally against its range, with the numeral in the ring's
// centre. Number and arc derive from the same live value, so the boot
// count-up and the idle drift animate both together by construction. The
// dashboard is GATED — the screen shows a "LINKING" state until the network
// is confirmed, then boots the rings.
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
const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p);

// Product-line CMF, coordinated with AuraEyez: the same light neutral-grey
// body (#AEAEB2 — AuraEyez's shell tone) across the hub and both submodules,
// dark window elements framing the display, and the pale purple concentrated
// at the technology points — knobs, lids, indicator domes/slivers, screen.
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

// The two submodule lids get their own module-level materials (air = 0,
// light = 1) so each can be driven independently — its emissive flashes up
// the instant the broadcast ripple reaches it, then decays. Same
// mutate-in-useFrame discipline as DOME_MAT / LED_MAT above.
const LID_MATS = [0, 1].map(
  () =>
    new THREE.MeshStandardMaterial({
      color: ACCENT,
      roughness: 0.48,
      metalness: 0.2,
      emissive: ACCENT,
      emissiveIntensity: LID_BASE,
    })
);

// Submodule recolor — the GLBs bake a near-black shell that vanishes against
// the section background, so the real palette is applied at runtime: the
// hub's light body tone on the shells, a mid-grey inner tray, pale purple on
// the lids (whose emissive is driven up on acknowledgment).
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
 *  - One-time entrance per session: the hub boots (domes warm on, screen
 *    powers to a "LINKING" state), then broadcasts concentric ripple rings
 *    outward from its centre. As each ripple front reaches a submodule's real
 *    position, that submodule's lid flashes — the signal arriving. Because
 *    the two sit at different distances, they acknowledge at slightly
 *    different moments. Once BOTH confirm, the live sensor dashboard boots
 *    on-screen and the ripples dissipate.
 *  - Idle: nothing broadcast, no ring/line at rest — just a gentle indicator
 *    breath and a subtle sensor drift animating each ring + numeral together.
 *  - Shares the sections' scroll-scrub yaw; nothing ever travels.
 */
export default function PulseModel({ progress }: { progress: number }) {
  const group = useRef<THREE.Group>(null);
  const ripples = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const screenMat = useRef<THREE.MeshBasicMaterial>(null);

  // one-time session decision: an already-played (or reduced-motion) visit
  // starts fully settled — no boot, no ripples, live readout from frame one
  const [skipped] = useState(() => linkPlayed() || prefersReducedMotion());

  const link = useRef<{ phase: "waiting" | "running" | "done"; t: number; idle: number }>({
    phase: skipped ? "done" : "waiting",
    t: 0,
    idle: 0,
  });
  const ackGlow = useRef([0, 0]); // per-submodule lid flash level (decays)
  const acked = useRef([false, false]); // each submodule acknowledges once
  const peakRadius = useRef(0); // monotonic max ripple radius reached
  const bothAckT = useRef(Infinity); // time both confirmed (gates late ripples)

  // display state: off until the hub boots, "connecting" during the
  // broadcast, then boots the dashboard and drifts. `drawnKey` gates canvas
  // redraws to actual value changes.
  const screen = useRef<{
    mode: "off" | "connecting" | "boot" | "live";
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
    // (ripples, submodules) sits at -z/2 below the hub's centre.
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

    // Each submodule's true horizontal distance from the hub centre (origin) —
    // this is what the ripple front must reach to trigger its acknowledgment.
    const modDist = MODS.map((m) => Math.hypot(m.x, m.z));

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
    const modReach = Math.max(
      ...MODS.map(
        (m) =>
          (Math.abs(m.x) + modSize.x / 2) * Math.cos(yawMax) +
          (Math.abs(m.z) + modSize.y / 2) * Math.sin(yawMax)
      )
    );
    fitHalf.w = Math.max(fitHalf.w, modReach);
    fitHalf.h += 0.05; // tilt-group y offset

    return {
      center,
      scale,
      fitHalf,
      baseY,
      modY,
      modDist,
      screenPos: [sCenter.x, sBox.max.y + 0.0006, sCenter.z] as [number, number, number],
      screenSize: [sSize.x * 0.94, sSize.z * 0.88] as [number, number],
    };
  }, [scene, airScene]);

  // Submodule scenes: hover raycasts off (no cursor interaction by design),
  // and the baked near-black palette re-themed to the light body + a mid-grey
  // inner. The lid mesh is swapped onto its module-level LID_MATS material so
  // the entrance can flash it independently. Idempotent on the cached scenes.
  useMemo(() => {
    [airScene, lightScene].forEach((s, sceneIdx) => {
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
          mesh.material = LID_MATS[sceneIdx];
        }
      });
    });
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

  // Draws the display. `mode`: "off" clears it; "connecting" shows the
  // LINKING state with a scanning dot; "dash" paints the activity rings.
  const drawScreen = (
    mode: "off" | "connecting" | "dash",
    temp = 0,
    hum = 0,
    dot = 0
  ) => {
    const g = gfx.current;
    if (!g) return;
    const scr = screen.current;
    const key =
      mode === "off"
        ? "off"
        : mode === "connecting"
          ? `conn:${dot}`
          : `${temp.toFixed(1)}|${Math.round(hum)}`;
    if (key === scr.drawnKey) return;
    scr.drawnKey = key;

    const { ctx, texture, font } = g;
    ctx.clearRect(0, 0, TEX_W, TEX_H);

    if (mode === "connecting") {
      // powered-but-not-yet-linked: dim panel, dim bezel, "LINKING" + a
      // three-dot scanner (one dot lit, cycling)
      ctx.fillStyle = "rgba(9, 10, 14, 0.94)";
      ctx.fillRect(0, 0, TEX_W, TEX_H);
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.22)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(7, 7, TEX_W - 14, TEX_H - 14);
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.72)`;
      ctx.font = `500 30px ${font}`;
      ctx.fillText("L I N K I N G", TEX_W / 2, TEX_H * 0.44);
      const dy = TEX_H * 0.64;
      const gap = 34;
      for (let i = 0; i < 3; i++) {
        const on = i === dot;
        ctx.beginPath();
        ctx.arc(TEX_W / 2 + (i - 1) * gap, dy, 7, 0, Math.PI * 2);
        if (on) {
          ctx.fillStyle = ACCENT;
          ctx.shadowColor = `rgba(${ACCENT_RGB}, 0.85)`;
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.22)`;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (mode === "dash") {
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

    if (screenMat.current && gfx.current && screenMat.current.map !== gfx.current.texture) {
      screenMat.current.map = gfx.current.texture;
      screenMat.current.needsUpdate = true;
    }

    const l = link.current;
    const t = state.clock.elapsedTime;
    let led = LED_DIM;

    // ---- one-time broadcast choreography ----
    if (l.phase === "waiting" && progress >= LINK_TRIGGER) {
      l.phase = "running";
      l.t = 0;
    }
    if (l.phase === "running") {
      l.t += dt;
      // step 1: the hub wakes — indicators warm on
      led =
        LED_DIM +
        (LED_ON - LED_DIM) *
          THREE.MathUtils.clamp((l.t - LED_RAMP[0]) / (LED_RAMP[1] - LED_RAMP[0]), 0, 1);

      // step 2: broadcast — each ripple expands (decelerating) and fades. New
      // ripples are suppressed once both modules have confirmed.
      let frontR = 0;
      for (let i = 0; i < RIPPLE_COUNT; i++) {
        const mesh = ripples.current[i];
        if (!mesh) continue;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const emit = RIPPLE_START + i * RIPPLE_STAGGER;
        const lp = (l.t - emit) / RIPPLE_DUR;
        if (lp > 0 && lp < 1 && emit <= bothAckT.current) {
          const r = RIPPLE_MAX_R * easeOutQuad(lp); // fast out, easing to a stop
          mesh.visible = true;
          mesh.scale.setScalar(r);
          mat.opacity = RIPPLE_PEAK * Math.pow(1 - lp, 1.3);
          if (r > frontR) frontR = r;
        } else {
          mesh.visible = false;
        }
      }
      // the leading front only ever grows — track its high-water mark so an
      // acknowledgment can't be missed between frames
      peakRadius.current = Math.max(peakRadius.current, frontR);

      // step 3: acknowledgment — the front reaching a module's real distance
      // flashes that module's lid, exactly once, at its own natural moment
      for (let i = 0; i < 2; i++) {
        if (!acked.current[i] && peakRadius.current >= layout.modDist[i]) {
          acked.current[i] = true;
          ackGlow.current[i] = 1;
        }
      }
      if (acked.current[0] && acked.current[1] && bothAckT.current === Infinity) {
        bothAckT.current = l.t;
        // step 4: connection confirmed — NOW boot the sensor dashboard
        if (screen.current.mode === "connecting") {
          screen.current.mode = "boot";
          screen.current.t = 0;
        }
      }

      if (l.t >= DONE_T) {
        l.phase = "done";
        for (const m of ripples.current) if (m) m.visible = false;
        markLinkPlayed();
      }
    } else if (l.phase === "done") {
      // idle: nothing broadcast, LEDs breathing on a slow loop
      for (const m of ripples.current) if (m) m.visible = false;
      l.idle += dt;
      const ip = (l.idle % IDLE_PERIOD) / IDLE_DUR;
      led = LED_ON + (ip < 1 ? 0.25 * Math.sin(Math.PI * ip) : 0);
    }
    DOME_MAT.emissiveIntensity = led * 0.3; // domes glow softer than slivers
    LED_MAT.emissiveIntensity = led;

    // ---- submodule lid acknowledgment flash: brief brighten, exp. decay ----
    for (let i = 0; i < 2; i++) {
      ackGlow.current[i] *= Math.exp(-dt / ACK_TAU);
      LID_MATS[i].emissiveIntensity = LID_BASE + ackGlow.current[i] * ACK_BOOST;
    }

    // ---- gated display ----
    const scr = screen.current;
    if (scr.mode === "off") {
      // hold dark until the hub powers, then show the LINKING state
      if (l.phase === "running") scr.mode = "connecting";
      drawScreen("off");
    } else if (scr.mode === "connecting") {
      drawScreen("connecting", 0, 0, Math.floor((l.t * 2.6) % 3));
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
      drawScreen("dash", scr.temp, scr.hum);
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
      drawScreen("dash", scr.temp, scr.hum);
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
          {/* fit clamp wraps the whole composition — hub, ripples, submodules */}
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

            {/* broadcast ripples — concentric rings on the floor, expanding
                outward from the hub's centre (entrance only; hidden at idle) */}
            {[0, 1, 2].map((i) => (
              <mesh
                key={i}
                ref={(m) => {
                  ripples.current[i] = m;
                }}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, layout.baseY + 0.012, 0]}
                visible={false}
                renderOrder={1}
              >
                <ringGeometry args={[0.86, 1, 72]} />
                <meshBasicMaterial
                  color={ACCENT}
                  transparent
                  opacity={0}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            ))}

            {/* companion submodules — lying flat, pale-purple caps up, at
                deliberately different distances from the hub */}
            {[airScene, lightScene].map((modScene, i) => (
              <group
                key={i}
                position={[MODS[i].x, layout.modY, MODS[i].z]}
                rotation={[0, MODS[i].x < 0 ? MOD_YAW : -MOD_YAW, 0]}
              >
                <group rotation={[FLAT, 0, 0]} scale={MOD_SCALE}>
                  <primitive object={modScene} />
                </group>
              </group>
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
