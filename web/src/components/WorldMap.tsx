"use client";

import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { MultiPolygon, Polygon } from "geojson";
import worldData from "world-atlas/land-110m.json";
import styles from "./WorldMap.module.css";

// Equirectangular crop: full longitude range, Antarctica trimmed.
const LAT_TOP = 85;
const LAT_BOTTOM = -58;
const ASPECT = (LAT_TOP - LAT_BOTTOM) / 360; // height = width * ASPECT

const SPACING = 7; // px between dot centers
const HOVER_RADIUS = 100; // px cursor light radius
const LOC_RADIUS_FRAC = 0.016; // highlight cluster radius as fraction of width
const PULSE_MS = 4000; // breathing period for highlighted clusters

const DIM = { r: 148, g: 160, b: 178 }; // resting dot tint
const BLUE = { r: 41, g: 151, b: 255 }; // #2997FF
const PURPLE = { r: 191, g: 90, b: 242 }; // #BF5AF2

const LOCATIONS = [
  { label: "SINGAPORE", lon: 103.82, lat: 1.35, dx: 16, dy: 16 },
  { label: "TAIWAN", lon: 121.0, lat: 23.7, dx: 20, dy: 14 },
  { label: "SHANGHAI", lon: 121.47, lat: 31.23, dx: 14, dy: -18 },
];

const STEPS = 24; // intensity quantization for the color lookup tables

interface Dot {
  x: number;
  y: number;
  locG: number; // 0..1 membership in a highlighted location cluster
  cur: number; // eased intensity
}

interface LabelPos {
  label: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mix = (
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number
) => ({ r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) });

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r.toFixed(0)}, ${c.g.toFixed(0)}, ${c.b.toFixed(0)}, ${a.toFixed(3)})`;

// Base dots: dim gray-blue at rest ramping to the blue accent when lit.
const BASE_LUT = Array.from({ length: STEPS + 1 }, (_, i) => {
  const t = i / STEPS;
  return rgba(mix(DIM, BLUE, t), 0.12 + 0.82 * t);
});
// Highlight clusters: blue/purple blend, never fully dim.
const LOC_LUT = Array.from({ length: STEPS + 1 }, (_, i) => {
  const t = i / STEPS;
  return rgba(mix(mix(BLUE, PURPLE, 0.4), mix(BLUE, PURPLE, 0.15), t), 0.3 + 0.7 * t);
});

// Smooth cosine-squared falloff, same family as the dock magnification.
const falloff = (dist: number, radius: number) => {
  const u = Math.min(dist / radius, 1);
  const c = Math.cos((u * Math.PI) / 2);
  return c * c;
};

export default function WorldMap() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [labels, setLabels] = useState<LabelPos[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const topo = worldData as unknown as Topology;
    const land = feature(topo, topo.objects.land as GeometryCollection).features[0]
      .geometry as MultiPolygon | Polygon;
    const polygons = land.type === "MultiPolygon" ? land.coordinates : [land.coordinates];

    let dots: Dot[] = [];
    let locPoints: { x: number; y: number; r: number }[] = [];
    let W = 0;
    let H = 0;
    const cursor = { x: -1e6, y: -1e6 };
    let frame = 0;
    let running = false;
    let needsFrame = true; // draw at least once even before any interaction

    const project = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * W,
      y: ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H,
    });

    const build = () => {
      W = wrap.clientWidth;
      H = Math.round(W * ASPECT);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rasterize landmass once, then sample the pixel grid for dot sites.
      const mask = document.createElement("canvas");
      mask.width = W;
      mask.height = H;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      mctx.fillStyle = "#fff";
      mctx.beginPath();
      for (const polygon of polygons) {
        for (const ring of polygon) {
          ring.forEach(([lon, lat], i) => {
            const p = project(lon, lat);
            if (i === 0) mctx.moveTo(p.x, p.y);
            else mctx.lineTo(p.x, p.y);
          });
          mctx.closePath();
        }
      }
      mctx.fill();
      const pixels = mctx.getImageData(0, 0, W, H).data;

      const locR = Math.max(10, W * LOC_RADIUS_FRAC);
      locPoints = LOCATIONS.map((l) => ({ ...project(l.lon, l.lat), r: locR }));

      const locWeight = (x: number, y: number) => {
        let g = 0;
        for (const p of locPoints) {
          g = Math.max(g, falloff(Math.hypot(x - p.x, y - p.y), p.r));
        }
        return g;
      };

      dots = [];
      for (let y = SPACING / 2; y < H; y += SPACING) {
        for (let x = SPACING / 2; x < W; x += SPACING) {
          const alpha = pixels[(Math.round(y) * W + Math.round(x)) * 4 + 3];
          if (alpha < 128) continue;
          dots.push({ x, y, locG: locWeight(x, y), cur: 0 });
        }
      }

      // Guarantee each marked location has a visible cluster even where the
      // 110m landmass omits small islands (Singapore).
      for (const p of locPoints) {
        const near = dots.some(
          (d) => d.locG > 0.3 && Math.hypot(d.x - p.x, d.y - p.y) < p.r
        );
        if (near) continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const x = p.x + ox * SPACING;
            const y = p.y + oy * SPACING;
            dots.push({ x, y, locG: locWeight(x, y), cur: 0 });
          }
        }
      }

      setLabels(
        LOCATIONS.map((l) => {
          const p = project(l.lon, l.lat);
          return { label: l.label, x: p.x, y: p.y, dx: l.dx, dy: l.dy };
        })
      );
      needsFrame = true;
    };

    const draw = (now: number) => {
      frame = 0;
      ctx.clearRect(0, 0, W, H);

      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((now / PULSE_MS) * Math.PI * 2);
      const ease = reduced ? 1 : 0.16;
      let settled = true;

      // Tick lines from each highlighted cluster toward its label.
      ctx.strokeStyle = "rgba(160, 170, 190, 0.35)";
      ctx.lineWidth = 1;
      for (let i = 0; i < locPoints.length; i++) {
        const { x, y } = locPoints[i];
        const { dx, dy } = LOCATIONS[i];
        ctx.beginPath();
        ctx.moveTo(x + Math.sign(dx) * 5, y + Math.sign(dy) * 5);
        ctx.lineTo(x + dx - 3, y + dy - Math.sign(dy) * 2);
        ctx.stroke();
      }

      for (const dot of dots) {
        const hoverG = falloff(Math.hypot(dot.x - cursor.x, dot.y - cursor.y), HOVER_RADIUS);
        const base = dot.locG * (0.5 + 0.3 * pulse);
        const target = Math.min(1, base + hoverG);
        dot.cur += (target - dot.cur) * ease;
        if (Math.abs(target - dot.cur) > 0.004) settled = false;
        else dot.cur = target;

        const idx = Math.round(dot.cur * STEPS);
        ctx.fillStyle = dot.locG > 0.12 ? LOC_LUT[idx] : BASE_LUT[idx];
        const r = 1.4 + 0.7 * dot.cur;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Keep animating while visible: the pulse is continuous, and hover
      // easing may still be settling. Under reduced motion the pulse is
      // static, so stop once everything has settled.
      if (running && (!reduced || !settled || needsFrame)) {
        needsFrame = false;
        frame = requestAnimationFrame(draw);
      }
    };

    const start = () => {
      if (!frame && running) frame = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      cursor.x = event.clientX - rect.left;
      cursor.y = event.clientY - rect.top;
      needsFrame = true;
      start();
    };
    const onPointerLeave = () => {
      cursor.x = -1e6;
      cursor.y = -1e6;
      needsFrame = true;
      start();
    };

    // Only animate while the map is on screen.
    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      if (running) start();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    build();
    const ro = new ResizeObserver(() => {
      build();
      start();
    });
    ro.observe(wrap);
    io.observe(canvas);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className={styles.section}>
      <div ref={wrapRef} className={styles.wrap}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        {labels.map((l) => (
          <span
            key={l.label}
            className={styles.label}
            style={{
              left: l.x + l.dx,
              top: l.y + l.dy,
            }}
            aria-hidden="true"
          >
            {l.label}
          </span>
        ))}
      </div>
      <p className={styles.caption}>
        Open to opportunities in Singapore, Taiwan, and Shanghai.
      </p>
    </section>
  );
}
