"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SceneLights from "./SceneLights";
import { relBox } from "./relBox";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { useFitClamp, worstCaseHalfExtents } from "./useFitClamp";

const MODEL = "/corelink.glb";
const AIR_MODEL = "/airmodule.glb";
const LIGHT_MODEL = "/lightmodule.glb";
const ACCENT = "#7B4DFF"; // the section's vibrant electric-violet theme
const ACCENT_RGB = "123, 77, 255";
const ENERGY = "#B49CFF"; // link pulses/arcs: lifted violet-white, reads over the ambient glow
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
// yaw. Their recolor is baked in the GLB: graphite shell, near-black inner,
// the section's violet concentrated on the lid.
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
const P1 = [0.55, 0.9] as const; // hub -> airmodule pulse travel window
const P2 = [0.95, 1.3] as const; // hub -> lightmodule pulse travel window
const ACK_FLASH = 0.55; // acknowledgment glow peak opacity
const ACK_DECAY = 0.35; // seconds for the flash to die toward ambient
const LINES_FADE = [1.35, 1.75] as const; // arcs dissolve once both are linked
const DONE_T = 1.8;
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

// Dyson-style redesign: dark engineered graphite body, the vibrant violet
// concentrated at the technology points — indicator domes/slivers, the
// screen readout and its bezel, the link pulses and rings. Matte discipline
// throughout: roughness 0.55-0.8, near-zero metalness, zero emissive except
// the genuinely light-emitting indicator elements.
const matte = (color: string, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });

const BODY_MAT = matte("#383C42", 0.72); // graphite shell
const CAP_MAT = matte("#26292E", 0.68); // darker front fascia
const PCB_MAT = matte("#234230", 0.6); // interior board, barely visible
const INLAY_MAT = matte("#101215", 0.5); // near-black screen window
const MODULE_MAT = matte("#3A3E45", 0.68);
const KNOB_MAT = matte("#17191D", 0.55); // deep charcoal controls
// knob-top domes + their tiny indicator slivers: emissive driven at runtime
const DOME_MAT = new THREE.MeshStandardMaterial({
  color: "#2B2E35",
  roughness: 0.45,
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

    // link-pulse arcs: hub's lower face out to each lid's centre
    const hubAnchor = new THREE.Vector3(0, -0.22, 0.14);
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

  // Submodule scenes: hover raycasts off (no cursor interaction by design).
  useMemo(() => {
    for (const s of [airScene, lightScene]) {
      s.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.raycast = () => {};
      });
    }
  }, [airScene, lightScene]);

  const fitGroup = useFitClamp(layout.fitHalf.w, layout.fitHalf.h);

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

      ctx.fillStyle = "#8F66FF"; // the accent, lifted a step for legibility
      ctx.shadowColor = `rgba(${ACCENT_RGB}, 0.6)`;
      ctx.shadowBlur = 16;
      ctx.font = `600 84px ${font}`;
      ctx.fillText(temp.toFixed(1), TEX_W * 0.25 - 22, 182);
      ctx.fillText(`${Math.round(hum)}`, TEX_W * 0.75 - 26, 182);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#6F61A6";
      ctx.font = `500 34px ${font}`;
      ctx.fillText("°C", TEX_W * 0.25 + 82, 156);
      ctx.fillText("%", TEX_W * 0.75 + 74, 156);
    }
    texture.needsUpdate = true;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1); // resume-safe (paused frameloop)

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
      l.t += dt;
      // step 2: the hub wakes — indicators warm on with the screen boot
      led =
        LED_DIM +
        (LED_ON - LED_DIM) *
          THREE.MathUtils.clamp((l.t - LED_RAMP[0]) / (LED_RAMP[1] - LED_RAMP[0]), 0, 1);

      // steps 3+4: a pulse travels to each submodule; arrival flashes it
      const windows = [P1, P2] as const;
      let dotPlaced = false;
      windows.forEach((w, i) => {
        const p = (l.t - w[0]) / (w[1] - w[0]);
        const line = fx.current?.lines[i];
        const mat = fx.current?.lineMats[i];
        if (!line || !mat) return;
        if (p > 0 && p < 1) {
          const eased = easeInOut(p);
          line.geometry.setDrawRange(0, Math.ceil(eased * TUBE_SEGS) * TUBE_IDX_PER_SEG);
          mat.opacity = 0.85;
          if (dot.current && !dotPlaced) {
            dotPlaced = true;
            dot.current.visible = true;
            dot.current.position.copy(layout.arcs[i].getPoint(eased));
            dot.current.scale.setScalar(1 + 0.25 * Math.sin(t * 14));
          }
        } else if (p >= 1) {
          line.geometry.setDrawRange(0, TUBE_SEGS * TUBE_IDX_PER_SEG);
          if (!ackFired.current[i]) {
            ackFired.current[i] = true; // acknowledge exactly once
            ackFlash.current[i] = 1;
          }
        }
      });
      if (!dotPlaced && dot.current) dot.current.visible = false;

      // step 5: both linked — the arcs dissolve
      const fade =
        1 - THREE.MathUtils.clamp((l.t - LINES_FADE[0]) / (LINES_FADE[1] - LINES_FADE[0]), 0, 1);
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
      ackFlash.current[i] = Math.max(0, ackFlash.current[i] - dt / ACK_DECAY);
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
      <SceneLights accent={ACCENT} accentIntensity={0.7} level={0.85} ambientScale={0.65} />
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
                  <mesh position={layout.screenPos} rotation={[-Math.PI / 2, 0, 0]}>
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
            <mesh ref={dot} visible={false}>
              <sphereGeometry args={[0.045, 16, 16]} />
              <meshBasicMaterial
                color={"#DCD2FF"}
                transparent
                opacity={0.95}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
              {/* soft outer glow riding the same position */}
              <mesh scale={2.4}>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial
                  color={"#B49CFF"}
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
